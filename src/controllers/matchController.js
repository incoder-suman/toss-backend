import Match from "../models/Match.js";
import Bet from "../models/Bet.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/**
 * 🏏 Create new match (admin)
 * Automatically sets team odds like {"India":1.98,"Australia":1.98}
 */
export const createMatch = async (req, res, next) => {
  try {
    const { title, startAt } = req.body;
    const teams = title.split(" vs ").map((t) => t.trim());

    const oddsMap = {};
    if (teams.length === 2) {
      oddsMap[teams[0]] = 1.98;
      oddsMap[teams[1]] = 1.98;
    }

    const match = await Match.create({
      title,
      startAt,
      odds: oddsMap,
      status: "UPCOMING",
    });

    res.status(201).json({
      message: "✅ Match created successfully",
      match,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * 📋 List all matches
 */
export const listMatches = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const matches = await Match.find(filter).sort({ startAt: -1 });
    res.json({ matches });
  } catch (e) {
    next(e);
  }
};

/**
 * ✏️ Update match details (admin)
 */
export const updateMatch = async (req, res, next) => {
  try {
    const updated = await Match.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ message: "Match not found" });
    res.json({ message: "Match updated successfully", match: updated });
  } catch (e) {
    next(e);
  }
};

/**
 * ⚙️ Update match status (LIVE / LOCKED / COMPLETED)
 */
export const updateMatchStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ["UPCOMING", "LIVE", "LOCKED", "COMPLETED", "CANCELLED"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ message: "Match not found" });

    match.status = status;
    if (["UPCOMING", "LIVE"].includes(status)) {
      match.result = "PENDING";
    }

    await match.save();
    res.json({ message: `Match status updated to ${status}`, match });
  } catch (e) {
    next(e);
  }
};

/**
 * 🎯 Declare result & settle bets (case-insensitive)
 */
export const setResult = async (req, res, next) => {
  try {
    const { result } = req.body; // team name (like India / Australia)
    const match = await Match.findById(req.params.id);

    if (!match) return res.status(404).json({ message: "Match not found" });
    if (match.status === "COMPLETED")
      return res.status(400).json({ message: "Match already completed" });

    // 🧾 Normalize result text (to lowercase)
    const normalizedResult = (result || "").trim().toLowerCase();

    // 🧾 Update match result
    match.result = result.trim();
    match.status = "COMPLETED";
    await match.save();

    const bets = await Bet.find({ match: match._id });
    let winners = 0,
      losers = 0;

    for (const bet of bets) {
      const user = await User.findById(bet.user);
      if (!user) continue;

      // ✅ Normalize both for case-insensitive match
      const betSide = (bet.side || "").trim().toLowerCase();

      if (betSide === normalizedResult) {
        // ✅ Bet WON
        bet.status = "WON";
        await bet.save();

        const winAmount = bet.potentialWin;
        user.walletBalance += winAmount;
        await user.save();

        await Transaction.create({
          user: user._id,
          type: "BET_WIN",
          amount: winAmount,
          meta: { matchId: match._id, betId: bet._id, result },
          balanceAfter: user.walletBalance,
        });
        winners++;
      } else {
        // ❌ Bet LOST
        bet.status = "LOST";
        await bet.save();

        await Transaction.create({
          user: user._id,
          type: "BET_LOST",
          amount: -bet.stake,
          meta: { matchId: match._id, betId: bet._id, result },
          balanceAfter: user.walletBalance,
        });
        losers++;
      }
    }

    res.json({
      message: `✅ Result declared for ${match.title}: ${result}`,
      matchId: match._id,
      winners,
      losers,
    });
  } catch (e) {
    console.error("❌ Error in setResult:", e);
    next(e);
  }
};
