import mongoose from "mongoose";
import Bet from "../models/Bet.js";
import Match from "../models/Match.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/* -------------------------------------------------------
 🧩 Helpers
------------------------------------------------------- */
const toNum = (v) => (isNaN(v) ? 0 : Number(v));
const norm = (s) => String(s || "").trim().toLowerCase();

/* -------------------------------------------------------
 🎯 PLACE BET — BAL ↓, EXP ↑
------------------------------------------------------- */
export const placeBet = async (req, res, next) => {
  try {
    const { matchId, side, stake } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!matchId || !side || stake == null)
      return res.status(400).json({ message: "Missing required fields" });

    const stakeAmount = toNum(stake);
    if (!Number.isFinite(stakeAmount) || stakeAmount <= 0)
      return res.status(400).json({ message: "Invalid stake amount" });

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });

    const status = String(match.status || "").toUpperCase();
    if (!["UPCOMING", "LIVE"].includes(status))
      return res.status(400).json({ message: "Betting closed for this match" });

    // ✅ Min/Max validation
    if (match.minBet && stakeAmount < match.minBet)
      return res
        .status(400)
        .json({ message: `Minimum bet is ₹${match.minBet}` });

    if (match.maxBet && stakeAmount > match.maxBet)
      return res
        .status(400)
        .json({ message: `Maximum bet is ₹${match.maxBet}` });

    // ✅ Normalize side
    const sideNorm = norm(side);
    const [a, b] = String(match.title || "")
      .split(/vs/i)
      .map((s) => norm(s));
    const teams = [
      { full: a, short: a?.slice(0, 3) },
      { full: b, short: b?.slice(0, 3) },
    ];

    const validSides = new Set([
      teams[0].full,
      teams[1].full,
      teams[0].short,
      teams[1].short,
    ]);
    if (!validSides.has(sideNorm))
      return res
        .status(400)
        .json({ message: `Invalid team side selected.` });

    const picked =
      [teams[0].full, teams[0].short].includes(sideNorm) ? teams[0] : teams[1];

    // ✅ Atomic: BAL -, EXP +
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
      return res
        .status(400)
        .json({ message: "Insufficient balance or user blocked" });

    // 💾 Transaction: BET_STAKE
    await Transaction.create({
      user: user._id,
      type: "BET_STAKE",
      amount: -stakeAmount,
      meta: { matchId, matchName: match.title, side: picked.full },
      balanceAfter: user.walletBalance,
    });

    // ✅ Calculate odds (default 1.98)
    const odds =
      toNum(match.odds?.[picked.full?.toUpperCase()]) ||
      toNum(match.odds?.[picked.short?.toUpperCase()]) ||
      1.98;
    const potentialWin = Math.round(stakeAmount * odds * 100) / 100;

    // ✅ Create bet
    const bet = await Bet.create({
      user: user._id,
      match: match._id,
      team: picked.full,
      stake: stakeAmount,
      potentialWin,
      status: "PENDING",
    });

    res.status(201).json({
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

/* -------------------------------------------------------
 🏆 PUBLISH RESULT — EXP ↓, BAL ↑ on win/refund
------------------------------------------------------- */
export const publishResult = async (req, res) => {
  try {
    const { matchId, result } = req.body;
    if (!matchId || !result)
      return res.status(400).json({ message: "Match ID and result required" });

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });

    const resultNorm = norm(result);

    match.result = result;
    match.status = "COMPLETED";
    await match.save();

    const bets = await Bet.find({ match: matchId });
    if (!bets.length)
      return res.json({ success: false, message: "No bets for this match" });

    for (const bet of bets) {
      const userId = bet.user;
      const user = await User.findById(userId);
      if (!user) continue;

      let txnType = "BET_LOST";
      let creditAmount = 0;

      const betTeam = norm(bet.team);

      // 🟡 DRAW
      if (resultNorm === "draw") {
        creditAmount = toNum(bet.stake);
        txnType = "REVERSAL";
        bet.status = "REFUNDED";
        bet.winAmount = 0;
      }
      // 🟢 WIN
      else if (betTeam === resultNorm) {
        creditAmount = toNum(bet.potentialWin);
        txnType = "BET_WIN";
        bet.status = "WON";
        bet.winAmount = creditAmount;
      }
      // 🔴 LOSS
      else {
        txnType = "BET_LOST";
        bet.status = "LOST";
        bet.winAmount = 0;
      }

      /* -----------------------------------------------
       ✅ Atomic Exposure & Balance Update
      ----------------------------------------------- */
      const stakeValue = Number(bet.stake) || 0;
      const decValue = -Math.abs(stakeValue);
      const creditValue = creditAmount > 0 ? Number(creditAmount) : 0;

      await User.updateOne(
        { _id: userId },
        {
          $inc: {
            exposure: decValue,
            ...(creditValue > 0 && { walletBalance: creditValue }),
          },
        }
      );

      const updatedUser = await User.findById(userId).select(
        "walletBalance exposure"
      );

      // 💾 Transaction
      await Transaction.create({
        user: userId,
        type: txnType,
        amount: creditAmount,
        meta: {
          matchId,
          matchName: match.title,
          side: bet.team,
        },
        balanceAfter: updatedUser.walletBalance,
      });

      await bet.save();
    }

    res.json({
      success: true,
      message: "✅ Result settled successfully (BAL & EXP updated)",
    });
  } catch (err) {
    console.error("❌ publishResult error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* -------------------------------------------------------
 ❌ CANCEL BET — BAL ↑, EXP ↓, remove bet
------------------------------------------------------- */
export const cancelBet = async (req, res) => {
  try {
    const userId = req.user?.id;
    const betId = req.params.id;

    const bet = await Bet.findById(betId);
    if (!bet) return res.status(404).json({ message: "Bet not found" });
    if (String(bet.user) !== String(userId))
      return res.status(403).json({ message: "Unauthorized" });
    if (bet.status !== "PENDING")
      return res.status(400).json({ message: "Bet already settled" });

    const stakeValue = toNum(bet.stake);

    await User.updateOne(
      { _id: userId },
      {
        $inc: { walletBalance: stakeValue, exposure: -stakeValue },
      }
    );

    const updatedUser = await User.findById(userId).select(
      "walletBalance exposure"
    );

    await Transaction.create({
      user: userId,
      type: "REVERSAL",
      amount: stakeValue,
      meta: {
        matchId: bet.match,
        note: "Bet cancelled and refunded",
      },
      balanceAfter: updatedUser.walletBalance,
    });

    await Bet.deleteOne({ _id: betId });

    res.json({
      success: true,
      message: "✅ Bet cancelled & refunded successfully",
      walletBalance: updatedUser.walletBalance,
      exposure: updatedUser.exposure,
    });
  } catch (err) {
    console.error("❌ cancelBet error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* -------------------------------------------------------
 📜 LIST ALL BETS
------------------------------------------------------- */
export const listBets = async (req, res) => {
  try {
    const { page = 1, limit = 50, userId, matchId, status } = req.query;
    const filter = {};
    if (userId) filter.user = userId;
    if (matchId) filter.match = matchId;
    if (status) filter.status = status;

    const bets = await Bet.find(filter)
      .populate("user", "name email")
      .populate("match", "title status result")
      .sort({ createdAt: -1 })
      .skip((page - 1) * Number(limit))
      .limit(Number(limit));

    const total = await Bet.countDocuments(filter);
    res.json({ bets, total });
  } catch (err) {
    console.error("❌ listBets error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* -------------------------------------------------------
 👤 MY BETS (current user)
------------------------------------------------------- */
export const myBets = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

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
 🕹️ TOSS HISTORY (completed/settled)
------------------------------------------------------- */
export const tossHistory = async (req, res) => {
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
          ["completed", "finished", "closed"].includes(
            String(b.match.status).toLowerCase()
          ))
    );

    res.status(200).json(completed);
  } catch (err) {
    console.error("❌ tossHistory error:", err);
    res.status(500).json({ message: err.message });
  }
};
