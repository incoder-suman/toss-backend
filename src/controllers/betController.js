import Bet from "../models/Bet.js";
import Match from "../models/Match.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/* -------------------------------------------------------
 🎯 PLACE BET CONTROLLER  (1.98x odds)
------------------------------------------------------- */
export const placeBet = async (req, res, next) => {
  try {
    const { matchId, side, stake } = req.body;
    const userId = req.user?.id;

    if (!matchId || !side || stake == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const stakeAmount = Number(stake);
    if (isNaN(stakeAmount) || stakeAmount <= 0) {
      return res.status(400).json({ message: "Invalid stake amount" });
    }

    // 1️⃣ Find the match
    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });

    const matchStatus = (match.status || "").toUpperCase();
    if (!["UPCOMING", "LIVE"].includes(matchStatus)) {
      return res.status(400).json({ message: "Betting closed for this match" });
    }

    // 2️⃣ Extract teams and normalize side
    const [teamA, teamB] = (match.title || "")
      .split(/vs/i)
      .map((s) => s.trim().toLowerCase());

    const sideNormalized = (side || "").trim().toLowerCase();
    if (![teamA, teamB].includes(sideNormalized)) {
      return res
        .status(400)
        .json({ message: `Invalid side selected. Valid: ${teamA}, ${teamB}` });
    }

    // 3️⃣ Validate user and wallet
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.isBlocked)
      return res.status(403).json({ message: "User is blocked" });

    const walletBalance = Number(user.walletBalance || 0);
    if (walletBalance < stakeAmount)
      return res.status(400).json({ message: "Insufficient wallet balance" });

    // 4️⃣ Deduct stake
    user.walletBalance = walletBalance - stakeAmount;
    await user.save();

    // 5️⃣ Record debit transaction
    await Transaction.create({
      user: user._id,
      type: "BET_STAKE",
      amount: -stakeAmount,
      meta: { matchId, side: sideNormalized },
      balanceAfter: user.walletBalance,
    });

    // 6️⃣ Calculate odds and potential win
    const odds = 1.98;
    const potentialWin = Number((stakeAmount * odds).toFixed(2));

    // 7️⃣ Create bet record
    const bet = await Bet.create({
      user: user._id,
      match: match._id,
      side: sideNormalized,
      stake: stakeAmount,
      potentialWin,
      status: "PENDING",
    });

    // 8️⃣ Send response
    res.status(201).json({
      message: "✅ Bet placed successfully",
      bet,
      currentBalance: user.walletBalance,
    });
  } catch (e) {
    console.error("❌ Bet placement error:", e);
    next(e);
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
      .skip((page - 1) * limit)
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
    if (!userId)
      return res.status(401).json({ message: "Unauthorized user" });

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
    if (!userId)
      return res.status(401).json({ message: "Unauthorized user" });

    const bets = await Bet.find({ user: userId })
      .populate("match", "title status result")
      .sort({ createdAt: -1 });

    const completed = bets.filter(
      (b) => b.match && b.match.status === "COMPLETED"
    );

    res.json(completed);
  } catch (err) {
    console.error("❌ tossHistory error:", err);
    next(err);
  }
};
