// ✅ backend/src/controllers/betController.js
import mongoose from "mongoose";
import Bet from "../models/Bet.js";
import Match from "../models/Match.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/* -------------------------------------------------------
 🎯 PLACE BET CONTROLLER (Enhanced with meta info)
------------------------------------------------------- */
export const placeBet = async (req, res, next) => {
  try {
    const { matchId, side, stake } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!matchId || !side || stake == null)
      return res.status(400).json({ message: "Missing required fields" });

    const stakeAmount = Number(stake);
    if (!Number.isFinite(stakeAmount) || stakeAmount <= 0)
      return res.status(400).json({ message: "Invalid stake amount" });

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });

    const status = String(match.status || "").toUpperCase();
    if (!["UPCOMING", "LIVE"].includes(status))
      return res.status(400).json({ message: "Betting closed for this match" });

    // ✅ Validate min/max
    if (typeof match.minBet === "number" && stakeAmount < match.minBet)
      return res
        .status(400)
        .json({ message: `Minimum bet is ₹${match.minBet}` });

    if (typeof match.maxBet === "number" && stakeAmount > match.maxBet)
      return res
        .status(400)
        .json({ message: `Maximum bet is ₹${match.maxBet}` });

    // ✅ Normalize teams
    const sideNorm = String(side).trim().toLowerCase();
    let teams;
    if (Array.isArray(match.teams) && match.teams.length === 2) {
      teams = match.teams.map((t) => ({
        full: t.full?.trim().toLowerCase(),
        short: t.short?.trim().toLowerCase(),
      }));
    } else {
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
      return res.status(400).json({ message: `Invalid team. Valid: ${readable}` });
    }

    const picked =
      [teams[0].full, teams[0].short, teams[0].full?.slice(0, 3)].includes(
        sideNorm
      )
        ? teams[0]
        : teams[1];

    // ✅ Atomic wallet deduction
    const userAfter = await User.findOneAndUpdate(
      {
        _id: userId,
        isBlocked: { $ne: true },
        walletBalance: { $gte: stakeAmount },
      },
      { $inc: { walletBalance: -stakeAmount } },
      { new: true }
    );

    if (!userAfter)
      return res
        .status(400)
        .json({ message: "Insufficient balance or user blocked" });

    // ✅ Transaction (with meta: matchName & side)
    await Transaction.create({
      user: userAfter._id,
      type: "BET_STAKE",
      amount: -stakeAmount,
      meta: {
        matchId,
        matchName: match.title,
        side: picked.full,
      },
      balanceAfter: userAfter.walletBalance,
    });

    // ✅ Determine odds
    const shortKeyUpper = picked.short?.toUpperCase();
    const odds =
      match.odds?.[shortKeyUpper] ??
      match.odds?.[picked.full] ??
      match.odds?.[picked.short] ??
      1.98;

    const potentialWin = Math.round(stakeAmount * Number(odds) * 100) / 100;

    // ✅ Create Bet
    const bet = await Bet.create({
      user: userAfter._id,
      match: match._id,
      team: picked.full,
      stake: stakeAmount,
      potentialWin,
      status: "PENDING",
    });

    return res.status(201).json({
      message: "✅ Bet placed successfully",
      bet,
      walletBalance: userAfter.walletBalance,
    });
  } catch (err) {
    console.error("❌ Bet placement error:", err);
    next(err);
  }
};

/* -------------------------------------------------------
 🏆 RESULT SETTLEMENT CONTROLLER (auto transaction)
------------------------------------------------------- */
export const publishResult = async (req, res) => {
  try {
    const { matchId, result } = req.body;
    if (!matchId || !result)
      return res.status(400).json({ message: "Match ID and result required" });

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });

    // ✅ Update match
    match.result = result;
    match.status = "COMPLETED";
    await match.save();

    // ✅ Get all bets
    const bets = await Bet.find({ match: matchId });

    for (const bet of bets) {
      const user = await User.findById(bet.user);
      if (!user) continue;

      if (bet.team.toLowerCase() === result.toLowerCase()) {
        // 🟩 User won
        const winAmount = bet.potentialWin;
        user.walletBalance += winAmount;
        await user.save();

        await Transaction.create({
          user: user._id,
          type: "BET_WIN",
          amount: winAmount,
          meta: {
            matchId,
            matchName: match.title,
            side: bet.team,
          },
          balanceAfter: user.walletBalance,
        });

        bet.status = "WON";
        bet.winAmount = winAmount;
        await bet.save();
      } else {
        // 🔴 User lost
        await Transaction.create({
          user: user._id,
          type: "BET_LOST",
          amount: 0,
          meta: {
            matchId,
            matchName: match.title,
            side: bet.team,
          },
          balanceAfter: user.walletBalance,
        });

        bet.status = "LOST";
        bet.winAmount = 0;
        await bet.save();
      }
    }

    res.json({ message: "✅ Result published successfully" });
  } catch (err) {
    console.error("❌ publishResult error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* -------------------------------------------------------
 📜 LIST ALL BETS (unchanged)
------------------------------------------------------- */
export const listBets = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, userId, matchId, status } = req.query;
    const filter = {};

    if (userId) {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        filter.user = userId;
      } else {
        const user = await User.findOne({
          $or: [{ email: userId }, { name: userId }],
        }).select("_id");
        if (user) filter.user = user._id;
        else return res.status(404).json({ message: "User not found" });
      }
    }

    if (matchId) filter.match = matchId;
    if (status) filter.status = status;

    const bets = await Bet.find(filter)
      .populate("user", "name email")
      .populate("match", "title status result")
      .sort({ createdAt: -1 })
      .skip((page - 1) * Number(limit))
      .limit(Number(limit));

    const total = await Bet.countDocuments(filter);

    const formatted = bets.map((b) => ({
      _id: b._id,
      userId: b.user?._id,
      email: b.user?.email,
      name: b.user?.name,
      match: b.match,
      team: b.team || b.side || "—",
      stake: b.stake,
      win: b.winAmount || b.potentialWin || 0,
      createdAt: b.createdAt,
    }));

    res.json({ bets: formatted, total });
  } catch (err) {
    console.error("❌ listBets error:", err.message);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  }
};

/* -------------------------------------------------------
 👤 MY BETS
------------------------------------------------------- */
export const myBets = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized user" });

    const bets = await Bet.find({ user: userId })
      .populate("match", "title status result startAt")
      .sort({ createdAt: -1 });

    res.json(bets);
  } catch (err) {
    console.error("❌ myBets error:", err);
    next(err);
  }
};

/* -------------------------------------------------------
 🕹️ TOSS HISTORY (unchanged)
------------------------------------------------------- */
export const tossHistory = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ message: "Unauthorized user" });

    const bets = await Bet.find({ user: userId })
      .populate("match", "title status result")
      .sort({ createdAt: -1 });

    const completed = bets.filter(
      (b) =>
        b.match &&
        (b.match.result ||
          ["completed", "finished", "result_declared", "closed"].includes(
            String(b.match.status).toLowerCase()
          ))
    );

    res.status(200).json(completed);
  } catch (err) {
    console.error("❌ tossHistory error:", err);
    res.status(500).json({ message: err.message });
  }
};
