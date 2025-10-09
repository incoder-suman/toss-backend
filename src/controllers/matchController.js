import Match from "../models/Match.js";
import Bet from "../models/Bet.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/**
 * 🏏 Create new match (admin)
 * Automatically normalizes team names & sets odds 1.98x
 */
export const createMatch = async (req, res, next) => {
  try {
    const { title, startAt } = req.body;

    if (!title) return res.status(400).json({ message: "Title is required" });

    // ✅ Split & normalize teams
    const teams = title
      .split(/vs/i)
      .map((t) => t.trim())
      .filter(Boolean);

    if (teams.length !== 2) {
      return res
        .status(400)
        .json({ message: "Please enter title as 'TeamA vs TeamB'" });
    }

    // ✅ Create short/full pair
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
    });

    res.status(201).json({
      message: "✅ Match created successfully",
      match,
    });
  } catch (e) {
    console.error("❌ Error creating match:", e);
    next(e);
  }
};

/**
 * 📋 List matches
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
 * ✏️ Update match details
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
    const validStatuses = [
      "UPCOMING",
      "LIVE",
      "LOCKED",
      "COMPLETED",
      "CANCELLED",
    ];

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
 * 🎯 Declare result & settle bets (supports DRAW + short/full names)
 */
export const setResult = async (req, res, next) => {
  try {
    const { result } = req.body;
    const match = await Match.findById(req.params.id);

    if (!match) return res.status(404).json({ message: "Match not found" });
    if (match.status === "COMPLETED")
      return res.status(400).json({ message: "Match already completed" });

    const normalizedResult = (result || "").trim().toLowerCase();

    // ✅ Handle Draw / Abandoned
    if (["draw", "abandoned", "no result"].includes(normalizedResult)) {
      match.result = "DRAW";
      match.status = "COMPLETED";
      await match.save();
      return res.json({
        message: `✅ Match declared as DRAW (no winners/losers).`,
        matchId: match._id,
      });
    }

    // ✅ Prepare team comparison map
    const teamNames =
      match.teams?.map((t) => ({
        full: t.full.trim().toLowerCase(),
        short: t.short.trim().toLowerCase(),
      })) || [];

    const matchedTeam = teamNames.find(
      (t) =>
        normalizedResult === t.full ||
        normalizedResult === t.short ||
        normalizedResult === t.full.slice(0, 3)
    );

    if (!matchedTeam) {
      return res.status(400).json({
        message: `Invalid team name. Valid options: ${teamNames
          .map((t) => `${t.full} (${t.short})`)
          .join(", ")}, or DRAW`,
      });
    }

    // ✅ Save result
    match.result = matchedTeam.full;
    match.status = "COMPLETED";
    await match.save();

    // ✅ Fetch bets
    const bets = await Bet.find({ match: match._id });
    if (!bets.length) {
      return res.json({
        message: `✅ Result declared for ${match.title}: ${matchedTeam.full} (no bets found)`,
        matchId: match._id,
      });
    }

    let winners = 0,
      losers = 0;

    for (const bet of bets) {
      const user = await User.findById(bet.user);
      if (!user) continue;

      const betSide = (bet.side || "").trim().toLowerCase();

      const isWin =
        betSide === matchedTeam.full ||
        betSide === matchedTeam.short ||
        betSide === matchedTeam.full.slice(0, 3);

      if (isWin) {
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
      message: `✅ Result declared for ${match.title}: ${matchedTeam.full}`,
      matchId: match._id,
      winners,
      losers,
    });
  } catch (e) {
    console.error("❌ Error in setResult:", e);
    next(e);
  }
};
