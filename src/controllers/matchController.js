import Match from "../models/Match.js";
import Bet from "../models/Bet.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/**
 * 🛠 helpers
 */
const toShort = (s = "") => String(s).trim().slice(0, 3).toUpperCase();
const norm = (s = "") => String(s).trim().toLowerCase();

/**
 * 🏏 CREATE MATCH (Admin)
 * - Auto short names
 * - Default odds 1.98x
 */
export const createMatch = async (req, res, next) => {
  try {
    const { title, startAt } = req.body;
    if (!title) return res.status(400).json({ message: "Title is required" });

    // Parse teams from title if possible
    const rawTeams = String(title)
      .split(/vs/i)
      .map((t) => t.trim())
      .filter(Boolean);

    if (rawTeams.length !== 2) {
      return res
        .status(400)
        .json({ message: "Please enter title as 'TeamA vs TeamB'" });
    }

    const normalizedTeams = rawTeams.map((t) => ({
      full: t,
      short: toShort(t),
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

    // If already completed/cancelled, block unsafe transitions
    const cur = String(match.status || "").toUpperCase();
    if (["COMPLETED", "CANCELLED"].includes(cur)) {
      return res
        .status(400)
        .json({ message: `Match already ${cur.toLowerCase()}` });
    }

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
 * PUT /api/matches/:id/result  { result: "heads"/"tails"/"draw"/teamName/short }
 */
export const setResult = async (req, res, next) => {
  try {
    const { result } = req.body;
    const matchId = req.params.id;

    if (!result)
      return res.status(400).json({ message: "Result value missing" });

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });

    const curStatus = String(match.status || "").toUpperCase();
    if (curStatus === "COMPLETED")
      return res.status(400).json({ message: "Match already completed" });
    if (curStatus === "CANCELLED")
      return res.status(400).json({ message: "Match is cancelled" });

    const r = norm(result);

    // -------------------------
    // DRAW / NO-RESULT BRANCH
    // -------------------------
    if (["draw", "abandoned", "no result", "no-result", "nr"].includes(r)) {
      match.status = "COMPLETED";
      match.result = "DRAW";
      await match.save();

      const bets = await Bet.find({ match: match._id });
      let refunded = 0;

      for (const bet of bets) {
        // idempotency guard
        if (["REFUNDED", "WON", "LOST"].includes(String(bet.status))) continue;

        const user = await User.findById(bet.user);
        if (!user) continue;

        user.walletBalance = Number(user.walletBalance || 0) + Number(bet.stake || 0);
        await user.save();

        bet.status = "REFUNDED";
        await bet.save();

        await Transaction.create({
          user: user._id,
          type: "REVERSAL", // keep schema-safe
          amount: Number(bet.stake || 0),
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

    // -------------------------
    // TEAM/VALUE NORMALIZATION
    // -------------------------
    // Ensure we have two teams; if not, attempt from title
    let teams = Array.isArray(match.teams) ? match.teams : [];
    if (teams.length !== 2) {
      const parts = String(match.title || "")
        .split(/vs/i)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length === 2) {
        teams = [
          { full: parts[0], short: toShort(parts[0]) },
          { full: parts[1], short: toShort(parts[1]) },
        ];
      } else {
        return res.status(400).json({
          message:
            "Cannot resolve teams from match; please ensure title is 'TeamA vs TeamB' or teams array is present.",
        });
      }
    }

    const teamNames = teams.map((t) => ({
      full: String(t.full || "").trim(),
      short: toShort(t.short || t.full || ""),
      fullLower: norm(t.full || ""),
      shortLower: norm(t.short || toShort(t.full || "")),
      fullShort3Lower: norm(String(t.full || "").slice(0, 3)),
    }));

    const matched = teamNames.find(
      (t) =>
        r === t.fullLower || r === t.shortLower || r === t.fullShort3Lower
    );

    if (!matched) {
      return res.status(400).json({
        message: `Invalid result. Must be one of: ${teamNames
          .map((t) => `${t.full} (${t.short})`)
          .join(", ")} or DRAW`,
      });
    }

    // -------------------------
    // APPLY RESULT & SETTLE
    // -------------------------
    match.result = matched.fullLower; // store result as normalized full team (lowercase)
    match.status = "COMPLETED";
    await match.save();

    const bets = await Bet.find({ match: match._id });
    let winners = 0,
      losers = 0;

    for (const bet of bets) {
      // idempotency guard
      if (["REFUNDED", "WON", "LOST"].includes(String(bet.status))) continue;

      const user = await User.findById(bet.user);
      if (!user) continue;

      const betSide = norm(bet.side || "");
      const isWin =
        betSide === matched.fullLower ||
        betSide === norm(matched.short) ||
        betSide === norm(matched.fullLower.slice(0, 3));

      if (isWin) {
        // WIN: credit potentialWin and mark WON
        bet.status = "WON";
        await bet.save();

        const winAmount = Number(bet.potentialWin || 0);
        user.walletBalance = Number(user.walletBalance || 0) + winAmount;
        await user.save();

        await Transaction.create({
          user: user._id,
          type: "BET_WIN", // enum-safe
          amount: winAmount,
          meta: { matchId: match._id, betId: bet._id, result: matched.fullLower },
          balanceAfter: user.walletBalance,
        });
        winners++;
      } else {
        // LOSS: stake already deducted at BET_STAKE time; just mark LOST
        bet.status = "LOST";
        await bet.save();

        // DO NOT create BET_LOST if enum doesn't allow it.
        // (If you insist on a record, add a note-only txn type to your schema.)
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
    // Avoid leaking raw error in production
    res.status(500).json({ message: "Internal error while publishing result" });
  }
};
