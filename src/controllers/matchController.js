import Match from "../models/Match.js";
import Bet from "../models/Bet.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/**
 * 🏏 CREATE MATCH (Admin)
 * Automatically sets short names + default odds 1.98x
 */
export const createMatch = async (req, res, next) => {
  try {
    const { title, startAt } = req.body;
    if (!title) return res.status(400).json({ message: "Title is required" });

    const teams = title
      .split(/vs/i)
      .map((t) => t.trim())
      .filter(Boolean);

    if (teams.length !== 2) {
      return res
        .status(400)
        .json({ message: "Please enter title as 'TeamA vs TeamB'" });
    }

    const normalizedTeams = teams.map((t) => ({
      full: t,
      short: t.slice(0, 3).toUpperCase(),
    }));

    const oddsMap = {
      [normalizedTeams[0].short]: 1.98,
      [normalizedTeams[1].short]: 1.98,
    };

    const match = await Match.create({
      title: `${normalizedTeams[0].full} vs ${normalizedTeams[1].full}`,
      startAt,
      odds: oddsMap,
      teams: normalizedTeams,
      status: "UPCOMING",
      result: "PENDING",
    });

    res.status(201).json({
      message: "✅ Match created successfully",
      match,
    });
  } catch (err) {
    console.error("❌ createMatch error:", err);
    next(err);
  }
};

/**
 * 📋 LIST MATCHES
 */
export const listMatches = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const matches = await Match.find(filter).sort({ startAt: -1 });
    res.json({ matches });
  } catch (err) {
    next(err);
  }
};

/**
 * ✏️ UPDATE MATCH DETAILS
 */
export const updateMatch = async (req, res, next) => {
  try {
    const updated = await Match.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ message: "Match not found" });
    res.json({ message: "✅ Match updated", match: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * ⚙️ UPDATE MATCH STATUS
 */
export const updateMatchStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const valid = ["UPCOMING", "LIVE", "LOCKED", "COMPLETED", "CANCELLED"];
    if (!valid.includes(status))
      return res.status(400).json({ message: "Invalid status" });

    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ message: "Match not found" });

    match.status = status;
    if (["UPCOMING", "LIVE"].includes(status)) match.result = "PENDING";
    await match.save();

    res.json({ message: `✅ Match status set to ${status}`, match });
  } catch (err) {
    next(err);
  }
};

/**
 * 🎯 DECLARE RESULT (supports DRAW + refund)
 */
export const setResult = async (req, res, next) => {
  try {
    const { result } = req.body;
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ message: "Match not found" });

    if (match.status === "COMPLETED")
      return res.status(400).json({ message: "Match already completed" });

    const normalizedResult = (result || "").trim().toLowerCase();

    // 🟡 DRAW CASE — Refund all bets
    if (["draw", "abandoned", "no result"].includes(normalizedResult)) {
      match.status = "COMPLETED";
      match.result = "DRAW";
      await match.save();

      const bets = await Bet.find({ match: match._id });
      let refunded = 0;

      for (const bet of bets) {
        const user = await User.findById(bet.user);
        if (!user) continue;

        user.walletBalance += bet.stake;
        await user.save();

        bet.status = "REFUNDED";
        await bet.save();

        await Transaction.create({
          user: user._id,
          type: "REVERSAL",
          amount: bet.stake,
          meta: { matchId: match._id, betId: bet._id, reason: "DRAW" },
          balanceAfter: user.walletBalance,
        });
        refunded++;
      }

      return res.json({
        message: `🤝 Match declared DRAW — ${refunded} refunds processed.`,
        matchId: match._id,
      });
    }

    // ✅ Team name validation
    const teamNames =
      match.teams?.map((t) => ({
        full: t.full.trim().toLowerCase(),
        short: t.short.trim().toLowerCase(),
      })) || [];

    const matched = teamNames.find(
      (t) =>
        normalizedResult === t.full ||
        normalizedResult === t.short ||
        normalizedResult === t.full.slice(0, 3)
    );

    if (!matched) {
      return res.status(400).json({
        message: `Invalid result. Must be one of: ${teamNames
          .map((t) => `${t.full} (${t.short})`)
          .join(", ")}, or DRAW`,
      });
    }

    // ✅ Apply result & settle bets
    match.result = matched.full;
    match.status = "COMPLETED";
    await match.save();

    const bets = await Bet.find({ match: match._id });
    let winners = 0,
      losers = 0;

    for (const bet of bets) {
      const user = await User.findById(bet.user);
      if (!user) continue;

      const betSide = (bet.side || "").trim().toLowerCase();
      const isWin =
        betSide === matched.full ||
        betSide === matched.short ||
        betSide === matched.full.slice(0, 3);

      if (isWin) {
        // ✅ WIN
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
        // ❌ LOSS
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
      message: `✅ Result declared for ${match.title}: ${matched.full}`,
      matchId: match._id,
      winners,
      losers,
    });
  } catch (err) {
    console.error("❌ setResult error:", err);
    next(err);
  }
};
