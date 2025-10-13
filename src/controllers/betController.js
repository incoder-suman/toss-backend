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

    // ✅ Min/Max validation (if defined on match)
    if (typeof match.minBet === "number" && stakeAmount < match.minBet) {
      return res.status(400).json({ message: `Minimum bet is ₹${match.minBet}` });
    }
    if (typeof match.maxBet === "number" && stakeAmount > match.maxBet) {
      return res.status(400).json({ message: `Maximum bet is ₹${match.maxBet}` });
    }

    // ✅ Side/team normalization
    const sideNorm = norm(side);
    let teams;

    if (Array.isArray(match.teams) && match.teams.length === 2) {
      teams = match.teams.map((t) => ({
        full: norm(t.full),
        short: norm(t.short || t.full?.slice(0, 3)),
      }));
    } else {
      // Fallback from title "A vs B"
      const [a, b] = String(match.title || "")
        .split(/vs/i)
        .map((s) => norm(s));
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
        .map((t) => `${(t.full || "").toUpperCase()} (${(t.short || "").toUpperCase()})`)
        .join(" or ");
      return res.status(400).json({ message: `Invalid team. Valid: ${readable}` });
    }

    const picked =
      [teams[0].full, teams[0].short, teams[0].full?.slice(0, 3)].includes(sideNorm)
        ? teams[0]
        : teams[1];

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

    if (!user) {
      return res
        .status(400)
        .json({ message: "Insufficient balance or user blocked" });
    }

    // 💾 Transaction: BET_STAKE
    await Transaction.create({
      user: user._id,
      type: "BET_STAKE",
      amount: -stakeAmount,
      meta: {
        matchId,
        matchName: match.title,
        side: picked.full,
      },
      balanceAfter: user.walletBalance,
    });

    // ✅ Odds resolve (try UPPER keys + fallbacks); default = 1.98
    const pickedUpper = String(picked.full || "").toUpperCase();
    const shortUpper = String(picked.short || "").toUpperCase();

    const odds =
      toNum(match.odds?.[shortUpper]) ||
      toNum(match.odds?.[pickedUpper]) ||
      toNum(match.odds?.[picked.short]) ||
      1.98;

    const potentialWin = Math.round(stakeAmount * odds * 100) / 100;

    // ✅ Create Bet
    const bet = await Bet.create({
      user: user._id,
      match: match._id,
      team: picked.full, // stored as normalized lower-case full
      stake: stakeAmount,
      potentialWin,
      status: "PENDING",
    });

    return res.status(201).json({
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
 🏆 PUBLISH RESULT — EXP ↓, BAL update (WIN/LOSS/DRAW)
------------------------------------------------------- */
export const publishResult = async (req, res) => {
  try {
    const { matchId, result } = req.body;

    if (!matchId || !result) {
      return res
        .status(400)
        .json({ message: "Match ID and result required" });
    }

    // ✅ Find Match
    const match = await Match.findById(matchId);
    if (!match)
      return res.status(404).json({ message: "Match not found" });

    const resultNorm = String(result || "").trim().toLowerCase();
    console.log("🟡 BEFORE:", {
  name: user.name,
  bal: user.walletBalance,
  exp: user.exposure,
  stake: bet.stake,
  credit: creditAmount,
  txnType,
});

    // ✅ Update Match
    match.result = result;
    match.status = "COMPLETED";
    await match.save();

    // ✅ Fetch all Bets for this Match
    const bets = await Bet.find({ match: matchId });
    if (!bets.length)
      return res.json({
        success: false,
        message: "No bets found for this match",
      });

    // ✅ Loop through each bet and settle it
    for (const bet of bets) {
      const userId = bet.user;
      const user = await User.findById(userId);
      if (!user) continue;

      let txnType = "BET_LOST";
      let creditAmount = 0;
      const betTeam = String(bet.team || "").trim().toLowerCase();

      /* -----------------------------------------------
       🟢 WIN / 🟡 DRAW / 🔴 LOSS Handling
      ----------------------------------------------- */
      if (resultNorm === "draw") {
        // 🟡 DRAW — refund stake
        creditAmount = toNum(bet.stake);
        txnType = "REVERSAL";
        bet.status = "REFUNDED";
        bet.winAmount = 0;
      } else if (betTeam === resultNorm) {
        // 🟢 WIN — pay potentialWin
        creditAmount = toNum(bet.potentialWin);
        txnType = "BET_WIN";
        bet.status = "WON";
        bet.winAmount = creditAmount;
      } else {
        // 🔴 LOSS — no payout
        bet.status = "LOST";
        bet.winAmount = 0;
      }

      /* -----------------------------------------------
       ✅ Atomic Update (Exposure ↓, BAL += if win/refund)
      ----------------------------------------------- */
      const stakeValue = toNum(bet.stake);
const creditValue = toNum(creditAmount);

const currentUser = await User.findById(userId);
if (!currentUser) continue;

// always decrease exposure
currentUser.exposure = Math.max(toNum(currentUser.exposure) - stakeValue, 0);

// credit wallet only on win/draw
if (creditValue > 0) {
  currentUser.walletBalance = toNum(currentUser.walletBalance) + creditValue;
}

await currentUser.save(); // commit to DB
console.log("🟢 AFTER SAVE:", {
  name: user.name,
  bal: user.walletBalance,
  exp: user.exposure,
});
      /* -----------------------------------------------
       💾 Transaction Record
      ----------------------------------------------- */
      const updatedUser = await User.findById(userId).select(
        "walletBalance exposure"
      );

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

    return res.json({
      success: true,
      message: "✅ Result settled successfully (BAL & EXP updated)",
    });
  } catch (err) {
    console.error("❌ publishResult error:", err);
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
      status: b.status,
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
 👤 MY BETS (current user)
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
 ❌ CANCEL BET — BAL ↑, EXP ↓, remove bet
------------------------------------------------------- */
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

    // Refund stake + reduce exposure
    user.walletBalance += toNum(bet.stake);
    user.exposure = Math.max(toNum(user.exposure) - toNum(bet.stake), 0);
    await user.save();

    await Transaction.create({
      user: user._id,
      type: "REVERSAL",
      amount: toNum(bet.stake),
      meta: {
        matchId: bet.match,
        note: "Bet cancelled and refunded",
      },
      balanceAfter: user.walletBalance,
    });

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

/* -------------------------------------------------------
 🕹️ TOSS HISTORY (completed/settled only)
------------------------------------------------------- */
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

    res.status(200).json(completed);
  } catch (err) {
    console.error("❌ tossHistory error:", err);
    res.status(500).json({ message: err.message });
  }
};
