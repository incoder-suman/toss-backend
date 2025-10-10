import Bet from "../models/Bet.js";
import Match from "../models/Match.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/* -------------------------------------------------------
 🎯 PLACE BET CONTROLLER (Stable, atomic & validated)
------------------------------------------------------- */
export const placeBet = async (req, res, next) => {
  try {
    const { matchId, side, stake } = req.body;
    const userId = req.user?.id;

    // 1️⃣ Validate inputs
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!matchId || !side || stake == null)
      return res.status(400).json({ message: "Missing required fields" });

    const stakeAmount = Number(stake);
    if (!Number.isFinite(stakeAmount) || stakeAmount <= 0)
      return res.status(400).json({ message: "Invalid stake amount" });

    // 2️⃣ Fetch & validate match
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });

    const status = String(match.status || "").toUpperCase();
    if (!["UPCOMING", "LIVE"].includes(status))
      return res.status(400).json({ message: "Betting closed for this match" });

    // ✅ Min/max bet constraints
    if (match.minBet && stakeAmount < match.minBet)
      return res
        .status(400)
        .json({ message: `Minimum bet is ₹${match.minBet}` });
    if (match.maxBet && stakeAmount > match.maxBet)
      return res
        .status(400)
        .json({ message: `Maximum bet is ₹${match.maxBet}` });

    // 3️⃣ Normalize sides
    const sideNorm = String(side).trim().toLowerCase();

    const teams = Array.isArray(match.teams)
      ? match.teams.map((t) => ({
          full: t.full?.trim().toLowerCase(),
          short: t.short?.trim().toLowerCase(),
        }))
      : (() => {
          const [a, b] = String(match.title || "")
            .split(/vs/i)
            .map((s) => s.trim().toLowerCase());
          return [
            { full: a, short: a?.slice(0, 3) },
            { full: b, short: b?.slice(0, 3) },
          ];
        })();

    // ✅ Allowed sides
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
        .map((t) => `${t.full.toUpperCase()} (${t.short.toUpperCase()})`)
        .join(" or ");
      return res.status(400).json({ message: `Invalid side. Valid: ${readable}` });
    }

    // ✅ Identify picked team (canonical)
    const picked =
      [teams[0].full, teams[0].short, teams[0].full?.slice(0, 3)].includes(sideNorm)
        ? teams[0]
        : teams[1];

    // 4️⃣ Deduct wallet (atomic, safe from double-spend)
    const user = await User.findOneAndUpdate(
      {
        _id: userId,
        isBlocked: { $ne: true },
        walletBalance: { $gte: stakeAmount },
      },
      { $inc: { walletBalance: -stakeAmount } },
      { new: true }
    );

    if (!user)
      return res
        .status(400)
        .json({ message: "Insufficient wallet balance or user blocked" });

    // 5️⃣ Log transaction
    await Transaction.create({
      user: user._id,
      type: "BET_STAKE",
      amount: -stakeAmount,
      meta: { matchId, side: picked.short, team: picked.full },
      balanceAfter: user.walletBalance,
    });

    // 6️⃣ Compute odds & potential win
    const shortKey = picked.short?.toUpperCase();
    const odds =
      match.odds?.[shortKey] ??
      match.odds?.[picked.full] ??
      match.odds?.[shortKey?.toLowerCase()] ??
      1.98;

    const potentialWin = Number((stakeAmount * odds).toFixed(2));

    // 7️⃣ Create bet
    const bet = await Bet.create({
      user: user._id,
      match: match._id,
      side: picked.short || sideNorm,
      stake: stakeAmount,
      potentialWin,
      status: "PENDING",
    });

    // 8️⃣ Return response
    return res.status(201).json({
      message: "✅ Bet placed successfully",
      bet,
      walletBalance: user.walletBalance,
      currentBalance: user.walletBalance,
    });
  } catch (err) {
    console.error("❌ Bet placement error:", err);
    next(err);
  }
};
