import mongoose from "mongoose";
import Bet from "../models/Bet.js";
import Match from "../models/Match.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/* -------------------------------------------------------
 🧩 Helper Utilities
------------------------------------------------------- */
const toNum = (v) => (isNaN(v) ? 0 : Number(v));
const norm = (s) => String(s || "").trim().toLowerCase();

/* =======================================================
 🎯 PLACE BET — BAL ↓ , EXP ↑
======================================================= */
export const placeBet = async (req, res, next) => {
  try {
    const { matchId, side, stake } = req.body;
    const userId = req.user?.id;

    // 🔒 Basic Validation
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!matchId || !side || stake == null)
      return res.status(400).json({ message: "Missing required fields" });

    const stakeAmount = toNum(stake);
    if (!Number.isFinite(stakeAmount) || stakeAmount <= 0)
      return res.status(400).json({ message: "Invalid stake amount" });

    // 🔍 Find Match
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });

    const status = String(match.status || "").toUpperCase();
    if (!["UPCOMING", "LIVE"].includes(status))
      return res.status(400).json({ message: "Betting closed for this match" });

    // ✅ Min/Max validation
    if (typeof match.minBet === "number" && stakeAmount < match.minBet)
      return res.status(400).json({ message: `Minimum bet is ₹${match.minBet}` });

    if (typeof match.maxBet === "number" && stakeAmount > match.maxBet)
      return res.status(400).json({ message: `Maximum bet is ₹${match.maxBet}` });

    // 🎯 Normalize teams
    const sideNorm = norm(side);
    let teams;

    if (Array.isArray(match.teams) && match.teams.length === 2) {
      teams = match.teams.map((t) => ({
        full: norm(t.full),
        short: norm(t.short || t.full?.slice(0, 3)),
      }));
    } else {
      const [a, b] = String(match.title || "")
        .split(/vs/i)
        .map((s) => norm(s));
      teams = [
        { full: a, short: a?.slice(0, 3) },
        { full: b, short: b?.slice(0, 3) },
      ];
    }

    // 🧩 Validate Side
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
        .map((t) => `${(t.full || "").toUpperCase()} (${(t.short || "").toUpperCase()})`)
        .join(" or ");
      return res.status(400).json({ message: `Invalid team. Valid: ${readable}` });
    }

    const picked =
      [teams[0].full, teams[0].short, teams[0].full?.slice(0, 3)].includes(sideNorm)
        ? teams[0]
        : teams[1];

    // 💰 Atomic: BAL -, EXP +
    const user = await User.findOneAndUpdate(
      {
        _id: userId,
        isBlocked: { $ne: true },
        walletBalance: { $gte: stakeAmount },
      },
      { $inc: { walletBalance: -stakeAmount, exposure: stakeAmount } },
      { new: true }
    );

    if (!user)
      return res.status(400).json({ message: "Insufficient balance or user blocked" });

    // 🧾 Transaction Log: BET_STAKE
    await Transaction.create({
      user: user._id,
      type: "BET_STAKE",
      amount: -stakeAmount,
      meta: { matchId, matchName: match.title, side: picked.full },
      balanceAfter: user.walletBalance,
    });

    // 🎲 Resolve odds
    const pickedUpper = String(picked.full || "").toUpperCase();
    const shortUpper = String(picked.short || "").toUpperCase();

    const odds =
      toNum(match.odds?.[shortUpper]) ||
      toNum(match.odds?.[pickedUpper]) ||
      toNum(match.odds?.[picked.short]) ||
      1.98;

    const potentialWin = Math.round(stakeAmount * odds * 100) / 100;

    // 📥 Create Bet record
    const bet = await Bet.create({
      user: user._id,
      match: match._id,
      team: picked.full,
      stake: stakeAmount,
      potentialWin,
      status: "PENDING",
    });

    // ✅ Response
    return res.status(201).json({
      success: true,
      message: "✅ Bet placed successfully",
      bet,
      walletBalance: user.walletBalance,
      exposure: user.exposure,
    });
  } catch (err) {
    console.error("❌ Bet placement error:", err);
    next(err);
  }
};

/* =======================================================
 🏆 PUBLISH RESULT — EXP ↓ , BAL update (WIN/LOSS/DRAW)
======================================================= */
export const publishResult = async (req, res) => {
  try {
    const { matchId, result } = req.body;

    if (!matchId || !result)
      return res.status(400).json({ message: "Match ID and result required" });

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });

    const resultNorm = norm(result);

    // 🟡 Update Match
    match.result = result;
    match.status = "COMPLETED";
    await match.save();

    // 🎯 Fetch Bets
    const bets = await Bet.find({ match: matchId });
    if (!bets.length)
      return res.json({ success: false, message: "No bets found for this match" });

    const matchName =
      match.matchName ||
      match.title ||
      `${match.teamA || "Team A"} Vs ${match.teamB || "Team B"}`;

    // 🔁 Loop all bets
    for (const bet of bets) {
      const user = await User.findById(bet.user);
      if (!user) continue;

      let txnType = "BET_LOST";
      let creditAmount = 0;

      const betTeam = norm(bet.team);

      if (resultNorm === "draw") {
        creditAmount = toNum(bet.stake);
        txnType = "REVERSAL";
        bet.status = "REFUNDED";
        bet.winAmount = 0;
      } else if (betTeam === resultNorm) {
        creditAmount = toNum(bet.potentialWin);
        txnType = "BET_WIN";
        bet.status = "WON";
        bet.winAmount = creditAmount;
      } else {
        bet.status = "LOST";
        bet.winAmount = 0;
      }

      // ⚙️ Exposure & Balance
      const stakeVal = toNum(bet.stake);
      user.exposure = Math.max(toNum(user.exposure) - stakeVal, 0);

      if (creditAmount > 0)
        user.walletBalance = toNum(user.walletBalance) + creditAmount;

      await user.save();

      // 💾 Transaction
      await Transaction.create({
        user: user._id,
        type: txnType,
        amount: creditAmount,
        meta: { matchId, matchName, side: bet.team },
        balanceAfter: user.walletBalance,
      });

      await bet.save();
    }

    return res.json({
      success: true,
      message: "✅ Result settled successfully (BAL & EXP updated)",
    });
  } catch (err) {
    console.error("❌ publishResult error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =======================================================
 🧾 LIST ALL BETS (Admin)
======================================================= */
export const listBets = async (req, res) => {
  try {
    const { page = 1, limit = 50, userId, matchId, status } = req.query;
    const filter = {};

    // 🔍 Optional filters
    if (userId) {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        filter.user = userId;
      } else {
        const user = await User.findOne({
          $or: [{ email: userId }, { name: userId }],
        }).select("_id");
        if (!user) return res.status(404).json({ message: "User not found" });
        filter.user = user._id;
      }
    }

    if (matchId) filter.match = matchId;
    if (status) filter.status = status;

    // 📄 Paginated list
    const bets = await Bet.find(filter)
      .populate("user", "name email")
      .populate("match", "title status result")
      .sort({ createdAt: -1 })
      .skip((page - 1) * Number(limit))
      .limit(Number(limit));

    const total = await Bet.countDocuments(filter);

    return res.json({ bets, total });
  } catch (err) {
    console.error("❌ listBets error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/* =======================================================
 👤 MY BETS — Current Logged-in User
======================================================= */
export const myBets = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized user" });

    const bets = await Bet.find({ user: userId })
      .populate("match", "title status result startAt")
      .sort({ createdAt: -1 });

    // ✅ Return array directly for frontend compatibility
    return res.json(bets);
  } catch (err) {
    console.error("❌ myBets error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =======================================================
 ❌ CANCEL BET — Refund + Adjust Exposure
======================================================= */
export const cancelBet = async (req, res) => {
  try {
    const userId = req.user?.id;
    const betId = req.params.id;

    const bet = await Bet.findById(betId);
    if (!bet) return res.status(404).json({ message: "Bet not found" });

    if (String(bet.user) !== String(userId))
      return res.status(403).json({ message: "Unauthorized cancel attempt" });

    if (bet.status !== "PENDING")
      return res.status(400).json({ message: "Bet already settled" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 💰 Refund stake
    const refund = toNum(bet.stake);
    user.walletBalance += refund;
    user.exposure = Math.max(toNum(user.exposure) - refund, 0);
    await user.save();

    // 🧾 Transaction
    await Transaction.create({
      user: user._id,
      type: "REVERSAL",
      amount: refund,
      meta: { matchId: bet.match, note: "Bet cancelled and refunded" },
      balanceAfter: user.walletBalance,
    });

    // 🗑️ Delete bet
    await Bet.deleteOne({ _id: betId });

    return res.json({
      success: true,
      message: "✅ Bet cancelled and refunded successfully",
      walletBalance: user.walletBalance,
      exposure: user.exposure,
    });
  } catch (err) {
    console.error("❌ cancelBet error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =======================================================
 🕹️ TOSS HISTORY — Completed Matches Only
======================================================= */
export const tossHistory = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized user" });

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

    return res.status(200).json({ bets: completed });
  } catch (err) {
    console.error("❌ tossHistory error:", err);
    res.status(500).json({ message: err.message });
  }
};
