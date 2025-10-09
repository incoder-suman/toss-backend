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

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    // ✅ Split and normalize team names
    const teams = title
      .split(/vs/i)
      .map((t) => t.trim())
      .filter(Boolean);

    if (teams.length !== 2) {
      return res
        .status(400)
        .json({ message: "Please enter title as 'TeamA vs TeamB'" });
    }

    // ✅ Prepare short + full name pair
    const normalizedTeams = teams.map((t) => ({
      full: t,
      short: t.slice(0, 3).toUpperCase(),
    }));

    // ✅ Odds map (short names)
    const oddsMap = {
      [normalizedTeams[0].short]: 1.98,
      [normalizedTeams[1].short]: 1.98,
    };

    const match = await Match.create({
      title: `${normalizedTeams[0].full} vs ${normalizedTeams[1].full}`,
      startAt,
      odds: oddsMap,
      teams: normalizedTeams, // ✅ save both short & full names
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
 * 🎯 Declare result & settle bets (supports short/full names)
 */
export const setResult = async (req, res, next) => {
  try {
    const { result } = req.body;
    const match = await Match.findById(req.params.id);

    if (!match) return res.status(404).json({ message: "Match not found" });
    if (match.status === "COMPLETED")
      return res.status(400).json({ message: "Match already completed" });

    // ✅ Normalize result
    const normalizedResult = (result || "").trim().toLowerCase();

    // ✅ Allow matching by short/full name
    const teamNames = match.teams?.map((t) => ({
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
        message: `Invalid team result. Must be one of: ${teamNames
          .map((t) => `${t.full} (${t.short})`)
          .join(", ")}`,
      });
    }

    match.result = matchedTeam.full;
    match.status = "COMPLETED";
    await match.save();

    const bets = await Bet.find({ match: match._id });
    let winners = 0,
      losers = 0;

    for (const bet of bets) {
      const user = await User.findById(bet.user);
      if (!user) continue;

      const betSide = (bet.side || "").trim().toLowerCase();

      // ✅ Compare by short/full equivalence
      const isWin =
        betSide === matchedTeam.full ||
        betSide === matchedTeam.short ||
        betSide === matchedTeam.full.slice(0, 3);

      if (isWin) {
        // 🏆 Winner
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
        // 💀 Loser
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
