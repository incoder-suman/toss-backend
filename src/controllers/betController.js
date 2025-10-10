import Bet from "../models/Bet.js";
import Match from "../models/Match.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/* -------------------------------------------------------
 🎯 PLACE BET CONTROLLER (robust: min/max, atomic wallet, short/full)
------------------------------------------------------- */
export const placeBet = async (req, res, next) => {
  try {
    const { matchId, side, stake } = req.body;
    const userId = req.user?.id;

    // 0) Basic validations
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!matchId || !side || stake == null)
      return res.status(400).json({ message: "Missing required fields" });

    const stakeAmount = Number(stake);
    if (!Number.isFinite(stakeAmount) || stakeAmount <= 0)
      return res.status(400).json({ message: "Invalid stake amount" });

    // 1) Match validations
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });

    const status = String(match.status || "").toUpperCase();
    if (!["UPCOMING", "LIVE"].includes(status))
      return res.status(400).json({ message: "Betting closed for this match" });

    // Enforce min/max if present on match
    if (typeof match.minBet === "number" && stakeAmount < match.minBet) {
      return res
        .status(400)
        .json({ message: `Minimum bet is ₹${match.minBet}` });
    }
    if (typeof match.maxBet === "number" && stakeAmount > match.maxBet) {
      return res
        .status(400)
        .json({ message: `Maximum bet is ₹${match.maxBet}` });
    }

    // 2) Normalize side (supports full/short)
    const sideNormalized = String(side || "").trim().toLowerCase();

    // Prefer canonical teams array if present
    let teamFullA, teamFullB, teamShortA, teamShortB;

    if (Array.isArray(match.teams) && match.teams.length === 2) {
      teamFullA = match.teams[0].full?.trim().toLowerCase();
      teamShortA = match.teams[0].short?.trim().toLowerCase();
      teamFullB = match.teams[1].full?.trim().toLowerCase();
      teamShortB = match.teams[1].short?.trim().toLowerCase();
    } else {
      // Fallback to title split
      const [a, b] = String(match.title || "")
        .split(/vs/i)
        .map((s) => s.trim().toLowerCase());
      teamFullA = a;
      teamFullB = b;
      teamShortA = a?.slice(0, 3);
      teamShortB = b?.slice(0, 3);
    }

    const matchSide = (candidate) => {
      const c = candidate?.toLowerCase();
      return (
        c === teamFullA ||
        c === teamShortA ||
        c === teamFullA?.slice(0, 3) ||
        c === teamFullB ||
        c === teamShortB ||
        c === teamFullB?.slice(0, 3)
      );
    };

    if (!matchSide(sideNormalized)) {
      return res.status(400).json({
        message: `Invalid side. Valid: ${[teamFullA, teamFullB]
          .filter(Boolean)
          .map((f, i) => `${f.toUpperCase()} (${i === 0 ? teamShortA?.toUpperCase() : teamShortB?.toUpperCase()})`)
          .join(" or ")}`,
      });
    }

    // Canonicalize to the matched team's SHORT code (useful for odds lookup)
    const picked =
      sideNormalized === teamFullA ||
      sideNormalized === teamShortA ||
      sideNormalized === teamFullA?.slice(0, 3)
        ? { full: teamFullA, short: (teamShortA || teamFullA?.slice(0, 3) || "").toUpperCase() }
        : { full: teamFullB, short: (teamShortB || teamFullB?.slice(0, 3) || "").toUpperCase() };

    // 3) Atomic wallet deduction to avoid double-spend
    // This updates only if balance >= stakeAmount
    const userAfter = await User.findOneAndUpdate(
      { _id: userId, isBlocked: { $ne: true }, walletBalance: { $gte: stakeAmount } },
      { $inc: { walletBalance: -stakeAmount } },
      { new: true }
    );

    if (!userAfter)
      return res
        .status(400)
        .json({ message: "Insufficient wallet balance or user blocked" });

    // 4) Record transaction (debit)
    await Transaction.create({
      user: userAfter._id,
      type: "BET_STAKE",
      amount: -stakeAmount,
      meta: { matchId, side: picked.short || sideNormalized },
      balanceAfter: userAfter.walletBalance,
    });

    // 5) Resolve odds: prefer odds by SHORT key, else by full, else default 1.98
    const odds =
      match.odds?.[picked.short] ??
      match.odds?.[picked.full] ??
      match.odds?.[picked.short?.toLowerCase?.()] ??
      1.98;

    const potentialWin = Math.round(stakeAmount * Number(odds) * 100) / 100;

    // 6) Create bet
    const bet = await Bet.create({
      user: userAfter._id,
      match: match._id,
      side: picked.short ? picked.short.toLowerCase() : sideNormalized, // store consistent
      stake: stakeAmount,
      potentialWin,
      status: "PENDING",
    });

    // 7) Success
    return res.status(201).json({
      message: "✅ Bet placed successfully",
      bet,
      walletBalance: userAfter.walletBalance, // keep both keys for older UI
      currentBalance: userAfter.walletBalance,
    });
  } catch (err) {
    console.error("❌ Bet placement error:", err);
    next(err);
  }
};
