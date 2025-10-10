// backend/src/controllers/betController.js
import Bet from "../models/Bet.js";
import Match from "../models/Match.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/* -------------------------------------------------------
 🎯 PLACE BET CONTROLLER (stable, atomic & validated)
  - Validates inputs
  - Enforces match.status (UPCOMING/LIVE)
  - Enforces minBet/maxBet if present
  - Accepts team by short/full name
  - Atomic wallet deduction (prevents double-spend)
  - Logs BET_STAKE transaction
  - Stores bet.side as LOWERCASE FULL team name
  - Odds priority: odds[SHORT] -> odds[FULL] -> 1.98
------------------------------------------------------- */
export const placeBet = async (req, res, next) => {
  try {
    const { matchId, side, stake } = req.body;
    const userId = req.user?.id;

    // 1) Basic validations
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!matchId || !side || stake == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const stakeAmount = Number(stake);
    if (!Number.isFinite(stakeAmount) || stakeAmount <= 0) {
      return res.status(400).json({ message: "Invalid stake amount" });
    }

    // 2) Match validations
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });

    const status = String(match.status || "").toUpperCase();
    if (!["UPCOMING", "LIVE"].includes(status)) {
      return res.status(400).json({ message: "Betting closed for this match" });
    }

    // Enforce min/max bet if present
    if (typeof match.minBet === "number" && stakeAmount < match.minBet) {
      return res.status(400).json({ message: `Minimum bet is ₹${match.minBet}` });
    }
    if (typeof match.maxBet === "number" && stakeAmount > match.maxBet) {
      return res.status(400).json({ message: `Maximum bet is ₹${match.maxBet}` });
    }

    // 3) Normalize team sides (support short/full)
    const sideNorm = String(side).trim().toLowerCase();

    // Prefer canonical teams array from DB if present
    let teams;
    if (Array.isArray(match.teams) && match.teams.length === 2) {
      teams = match.teams.map((t) => ({
        full: t.full?.trim().toLowerCase(),
        short: t.short?.trim().toLowerCase(),
      }));
    } else {
      // fallback: parse from title
      const [a, b] = String(match.title || "")
        .split(/vs/i)
        .map((s) => s.trim().toLowerCase());
      teams = [
        { full: a, short: a?.slice(0, 3) },
        { full: b, short: b?.slice(0, 3) },
      ];
    }

    const validSides = new Set([
      teams[0].full,
      teams[1].full,
      teams[0].short,
      teams[1].short,
      teams[0].full?.slice(0, 3),
      teams[1].full?.slice(0, 3),
    ]);

    if (!validSides.has(sideNorm)) {
      const readable = teams
        .map((t) => `${t.full?.toUpperCase()} (${t.short?.toUpperCase()})`)
        .join(" or ");
      return res.status(400).json({ message: `Invalid side. Valid: ${readable}` });
    }

    // Canonical picked team (we’ll store FULL lower-case in bet.side)
    const picked =
      [teams[0].full, teams[0].short, teams[0].full?.slice(0, 3)].includes(sideNorm)
        ? teams[0]
        : teams[1];

    // 4) Atomic wallet deduction
    const userAfter = await User.findOneAndUpdate(
      {
        _id: userId,
        isBlocked: { $ne: true },
        walletBalance: { $gte: stakeAmount },
      },
      { $inc: { walletBalance: -stakeAmount } },
      { new: true }
    );
    if (!userAfter) {
      return res
        .status(400)
        .json({ message: "Insufficient wallet balance or user blocked" });
    }

    // 5) Record transaction
    await Transaction.create({
      user: userAfter._id,
      type: "BET_STAKE",
      amount: -stakeAmount,
      meta: { matchId, side: picked.short, team: picked.full },
      balanceAfter: userAfter.walletBalance,
    });

    // 6) Resolve odds (prefer SHORT key)
    const shortKeyUpper = picked.short?.toUpperCase();
    const odds =
      match.odds?.[shortKeyUpper] ??
      match.odds?.[picked.full] ??
      match.odds?.[picked.short] ??
      1.98;

    const potentialWin = Math.round(stakeAmount * Number(odds) * 100) / 100;

    // 7) Create bet (store side as LOWERCASE FULL name for consistent settlement)
    const bet = await Bet.create({
      user: userAfter._id,
      match: match._id,
      side: picked.full, // store canonical lower-case full name
      stake: stakeAmount,
      potentialWin,
      status: "PENDING",
    });

    // 8) Done
    return res.status(201).json({
      message: "✅ Bet placed successfully",
      bet,
      walletBalance: userAfter.walletBalance,
      currentBalance: userAfter.walletBalance,
    });
  } catch (err) {
    console.error("❌ Bet placement error:", err);
    next(err);
  }
};

/* -------------------------------------------------------
 📜 LIST ALL BETS (ADMIN)
------------------------------------------------------- */
export const listBets = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, userId, matchId, status } = req.query;
    const filter = {};
    if (userId) filter.user = userId;
    if (matchId) filter.match = matchId;
    if (status) filter.status = status;

    const bets = await Bet.find(filter)
      .populate("user", "name email")
      .populate("match", "title startAt status result")
      .sort({ createdAt: -1 })
      .skip((page - 1) * Number(limit))
      .limit(Number(limit));

    const total = await Bet.countDocuments(filter);
    res.json({ bets, total });
  } catch (e) {
    console.error("❌ listBets error:", e);
    next(e);
  }
};

/* -------------------------------------------------------
 👤 MY BETS (LOGGED-IN USER)
------------------------------------------------------- */
export const myBets = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized user" });

    const bets = await Bet.find({ user: userId })
      .populate("match", "title startAt status result")
      .sort({ createdAt: -1 });

    res.json(bets);
  } catch (err) {
    console.error("❌ myBets error:", err);
    next(err);
  }
};

/* -------------------------------------------------------
 🕹️ USER TOSS HISTORY (COMPLETED MATCHES)
------------------------------------------------------- */
export const tossHistory = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized user" });

    const bets = await Bet.find({ user: userId })
      .populate("match", "title status result")
      .sort({ createdAt: -1 });

    const completed = bets.filter((b) => b.match && b.match.status === "COMPLETED");
    res.json(completed);
  } catch (err) {
    console.error("❌ tossHistory error:", err);
    next(err);
  }
};
