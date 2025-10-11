// ✅ backend/src/controllers/matchController.js
import Match from "../models/Match.js";
import Bet from "../models/Bet.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/* -------------------------------------------------------
 🧩 Helpers
------------------------------------------------------- */
const toShort = (s = "") => String(s).trim().slice(0, 3).toUpperCase();
const norm = (s = "") => String(s).trim().toLowerCase();

/* -------------------------------------------------------
 🏏 CREATE MATCH (Admin)
  - requires: title, startAt, lastBetTime
  - builds teams + default odds
------------------------------------------------------- */
export const createMatch = async (req, res, next) => {
  try {
    const { title, startAt, lastBetTime, minBet, maxBet } = req.body;

    if (!title || !startAt || !lastBetTime) {
      return res
        .status(400)
        .json({ message: "Title, startAt and lastBetTime are required" });
    }

    const start = new Date(startAt);
    const close = new Date(lastBetTime);
    if (!(start instanceof Date) || isNaN(start.getTime()))
      return res.status(400).json({ message: "Invalid startAt" });
    if (!(close instanceof Date) || isNaN(close.getTime()))
      return res.status(400).json({ message: "Invalid lastBetTime" });
    if (close >= start)
      return res
        .status(400)
        .json({ message: "lastBetTime must be before startAt" });

    // Parse teams from title
    const rawTeams = String(title)
      .split(/vs/i)
      .map((t) => t.trim())
      .filter(Boolean);

    if (rawTeams.length !== 2) {
      return res
        .status(400)
        .json({ message: "Title must be in format: 'TeamA vs TeamB'" });
    }

    const teams = rawTeams.map((t) => ({ full: t, short: toShort(t) }));

    const odds = {
      [teams[0].short]: 1.98,
      [teams[1].short]: 1.98,
    };

    const match = await Match.create({
      title: `${teams[0].full} vs ${teams[1].full}`,
      startAt: start,
      lastBetTime: close,
      odds,
      teams,
      status: "UPCOMING",
      result: "PENDING",
      ...(typeof minBet === "number" ? { minBet } : {}),
      ...(typeof maxBet === "number" ? { maxBet } : {}),
    });

    res.status(201).json({ message: "✅ Match created successfully", match });
  } catch (err) {
    console.error("❌ createMatch error:", err);
    next(err);
  }
};

/* -------------------------------------------------------
 📋 LIST MATCHES
------------------------------------------------------- */
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

/* -------------------------------------------------------
 ✏️ UPDATE MATCH DETAILS
------------------------------------------------------- */
export const updateMatch = async (req, res, next) => {
  try {
    // Optional: prevent lastBetTime >= startAt
    if (req.body.startAt || req.body.lastBetTime) {
      const start = req.body.startAt ? new Date(req.body.startAt) : null;
      const close = req.body.lastBetTime ? new Date(req.body.lastBetTime) : null;
      if (start && isNaN(start.getTime()))
        return res.status(400).json({ message: "Invalid startAt" });
      if (close && isNaN(close.getTime()))
        return res.status(400).json({ message: "Invalid lastBetTime" });
      if (start && close && close >= start)
        return res
          .status(400)
          .json({ message: "lastBetTime must be before startAt" });
    }

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

/* -------------------------------------------------------
 ⚙️ UPDATE MATCH STATUS
------------------------------------------------------- */
export const updateMatchStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const valid = ["UPCOMING", "LIVE", "LOCKED", "COMPLETED", "CANCELLED"];
    if (!valid.includes(status))
      return res.status(400).json({ message: "Invalid status" });

    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ message: "Match not found" });

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

/* -------------------------------------------------------
 🏁 PUBLISH or UPDATE RESULT (Admin)
 Render-safe (no Mongo transactions)
 - Reverses previous settlement if any
 - Re-settles with new outcome (team or DRAW)
------------------------------------------------------- */
export const publishOrUpdateResult = async (req, res) => {
  try {
    const { id } = req.params;
    const { result } = req.body;

    if (!result) {
      return res.status(400).json({ message: "Result is required" });
    }

    const match = await Match.findById(id);
    if (!match) return res.status(404).json({ message: "Match not found" });

    // Normalize teams & requested result
    const normalizedResult = norm(result);
    let teams;
    if (Array.isArray(match.teams) && match.teams.length === 2) {
      teams = match.teams.map((t) => ({
        full: norm(t.full),
        short: norm(t.short || toShort(t.full)),
      }));
    } else {
      const [a, b] = String(match.title || "")
        .split(/vs/i)
        .map((s) => norm(s));
      teams = [
        { full: a, short: norm(toShort(a)) },
        { full: b, short: norm(toShort(b)) },
      ];
    }

    const winner =
      ["draw", "abandoned", "no-result", "nr"].includes(normalizedResult)
        ? "DRAW"
        : teams.find(
            (t) =>
              t.full === normalizedResult ||
              t.short === normalizedResult ||
              normalizedResult === norm(t.full.slice(0, 3))
          )?.full;

    if (!winner) {
      return res.status(400).json({
        message: `Invalid result. Valid: ${teams
          .map((t) => `${t.full.toUpperCase()} (${t.short.toUpperCase()})`)
          .join(" or ")} or DRAW`,
      });
    }

    // 1) Reverse previous settlement if already settled earlier
    const hadResultBefore =
      !!match.result && !["PENDING", "DRAW"].includes(match.result);

    if (hadResultBefore) {
      const oldBets = await Bet.find({
        match: id,
        status: { $in: ["WON", "LOST", "REFUNDED"] },
      });

      for (const b of oldBets) {
        const user = await User.findById(b.user);
        if (!user) continue;

        if (b.status === "WON" && b.winAmount > 0) {
          user.walletBalance = (user.walletBalance || 0) - b.winAmount;
          await user.save();
          await Transaction.create({
            user: user._id,
            type: "REVERSAL",
            amount: -Math.abs(b.winAmount),
            meta: {
              matchId: id,
              reason: "Reversing previous WIN due to result change",
              betId: b._id,
            },
            balanceAfter: user.walletBalance,
          });
        } else if (b.status === "REFUNDED") {
          const refund = b.stake || 0;
          user.walletBalance = (user.walletBalance || 0) - refund;
          await user.save();
          await Transaction.create({
            user: user._id,
            type: "REVERSAL",
            amount: -Math.abs(refund),
            meta: {
              matchId: id,
              reason: "Reversing previous REFUND due to result change",
              betId: b._id,
            },
            balanceAfter: user.walletBalance,
          });
        }
      }

      // Reset bets back to pending before new settlement
      await Bet.updateMany(
        { match: id },
        { $set: { status: "PENDING", winAmount: 0 } }
      );
    }

    // 2) Apply the new result & settle
    match.result = winner; // "DRAW" or full team (lowercase)
    match.status = "RESULT_DECLARED";
    await match.save();

    const bets = await Bet.find({ match: id, status: "PENDING" });

    for (const b of bets) {
      const user = await User.findById(b.user);
      if (!user) continue;

      if (winner === "DRAW") {
        const refund = b.stake || 0;
        user.walletBalance = (user.walletBalance || 0) + refund;
        b.status = "REFUNDED";
        b.winAmount = 0;

        await user.save();
        await b.save();

        await Transaction.create({
          user: user._id,
          type: "REVERSAL",
          amount: refund,
          meta: { matchId: id, reason: "Match DRAW - refund stake", betId: b._id },
          balanceAfter: user.walletBalance,
        });
      } else {
        const betTeam = norm(b.team || b.side || "");
        if (betTeam && betTeam === norm(winner)) {
          const credit = b.potentialWin || 0;
          b.status = "WON";
          b.winAmount = credit;
          user.walletBalance = (user.walletBalance || 0) + credit;

          await user.save();
          await b.save();

          await Transaction.create({
            user: user._id,
            type: "BET_WIN",
            amount: credit,
            meta: { matchId: id, betId: b._id },
            balanceAfter: user.walletBalance,
          });
        } else {
          b.status = "LOST";
          b.winAmount = 0;
          await b.save();
        }
      }
    }

    res.status(200).json({
      message: "✅ Result published or updated successfully.",
      matchId: id,
    });
  } catch (err) {
    console.error("❌ publishOrUpdateResult error:", err?.message || err);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: err?.message || String(err) });
  }
};
