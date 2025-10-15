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
------------------------------------------------------- */
export const createMatch = async (req, res, next) => {
  try {
    const { title, lastBetTime, minBet, maxBet } = req.body;

    if (!title || !lastBetTime) {
      return res
        .status(400)
        .json({ message: "Title and lastBetTime are required" });
    }

    const liveTime = new Date(lastBetTime);
    if (isNaN(liveTime)) {
      return res.status(400).json({ message: "Invalid date format for lastBetTime" });
    }

    // Parse teams
    const rawTeams = String(title)
      .split(/vs/i)
      .map((t) => t.trim())
      .filter(Boolean);

    if (rawTeams.length !== 2) {
      return res.status(400).json({
        message: "Title must be in format: 'TeamA vs TeamB'",
      });
    }

    const teams = rawTeams.map((t) => ({ full: t, short: toShort(t) }));
    const odds = { [teams[0].short]: 1.98, [teams[1].short]: 1.98 };

    const match = await Match.create({
      title: `${teams[0].full} vs ${teams[1].full}`,
      lastBetTime: liveTime, // single decisive time
      odds,
      teams,
      status: "UPCOMING",
      result: "PENDING",
      minBet: minBet ?? 10,
      maxBet: maxBet ?? 1000,
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
    const matches = await Match.find(filter).sort({ lastBetTime: -1 });
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
      return res.status(400).json({ message: `Match already ${cur.toLowerCase()}` });
    }

    match.status = status;
    if (["UPCOMING", "LIVE"].includes(status)) match.result = "PENDING";
    await match.save();

    /* ✅ NEW ADDITION — Refund logic if match is CANCELLED */
    if (status === "CANCELLED") {
      const bets = await Bet.find({ match: match._id, status: "PENDING" });
      const shortA = match?.teams?.[0]?.short || match?.teams?.[0]?.full || "TeamA";
      const shortB = match?.teams?.[1]?.short || match?.teams?.[1]?.full || "TeamB";
      const matchTitle = `${shortA} Vs ${shortB}`;
      let refunds = 0;

      for (const b of bets) {
        const user = await User.findById(b.user);
        if (!user) continue;

        // 💰 Return bet stake to wallet
        user.walletBalance += b.stake;
        user.exposure -= b.stake;
        await user.save();

        // 🧾 Update bet status
        b.status = "REFUNDED";
        await b.save();

        // 🧠 Record transaction for wallet history
        await Transaction.create({
          user: user._id,
          type: "REVERSAL",
          amount: b.stake,
          meta: {
            matchId: match._id,
            matchName: matchTitle,  // ✅ show name in wallet history
            reason: "Match cancelled refund",
            betId: b._id,
          },
          balanceAfter: user.walletBalance,
        });

        console.log("🟡 MATCH DATA:", match);
console.log("🟡 TEAMS:", match?.teams);
console.log("🟡 TITLE:", match?.title);
        refunds++;
      }

      console.log(`♻️ Refunded ${refunds} bets due to match cancellation`);
    }

    // ⚡ Existing unchanged response
    res.json({ message: `✅ Match status set to ${status}`, match });
  } catch (err) {
    next(err);
  }
};


/* -------------------------------------------------------
 🏁 PUBLISH or UPDATE RESULT (Admin)
------------------------------------------------------- */
export const publishOrUpdateResult = async (req, res) => {
  try {
    const { id } = req.params;
    const { result } = req.body;

    if (!result) return res.status(400).json({ message: "Result is required" });

    const match = await Match.findById(id);
    if (!match) return res.status(404).json({ message: "Match not found" });

    // ✅ Get readable match title
    const shortNameA = match?.teams?.[0]?.short || match?.teams?.[0]?.full || "TeamA";
    const shortNameB = match?.teams?.[1]?.short || match?.teams?.[1]?.full || "TeamB";
    const matchTitle = `${shortNameA} Vs ${shortNameB}`;

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

    /* ----------------------------------------------------
       🧹 Reverse old settlement if any
    ---------------------------------------------------- */
    const hadResultBefore =
      !!match.result && !["PENDING", "DRAW"].includes(match.result);

    if (hadResultBefore) {
      const oldBets = await Bet.find({
        match: id,
        status: { $in: ["WON", "LOST", "REFUNDED"] },
      });

      let reversed = 0;
      for (const b of oldBets) {
        const user = await User.findById(b.user);
        if (!user) continue;

        if (b.status === "WON" && b.winAmount > 0) {
          user.walletBalance -= Math.abs(b.winAmount);
          await user.save();
          reversed++;
          await Transaction.create({
            user: user._id,
            type: "REVERSAL",
            amount: -Math.abs(b.winAmount),
            meta: {
              matchId: id,
              matchName: matchTitle, // ✅ added
              reason: "Undo previous WIN",
              betId: b._id,
            },
            balanceAfter: user.walletBalance,
          });
        } else if (b.status === "REFUNDED") {
          const refund = Math.abs(b.stake || 0);
          user.walletBalance -= refund;
          await user.save();
          reversed++;
          await Transaction.create({
            user: user._id,
            type: "REVERSAL",
            amount: -refund,
            meta: {
              matchId: id,
              matchName: matchTitle, // ✅ added
              reason: "Undo previous REFUND",
              betId: b._id,
            },
            balanceAfter: user.walletBalance,
          });
        }
      }

      await Bet.updateMany(
        { match: id },
        { $set: { status: "PENDING", winAmount: 0 } }
      );

      console.log(`🔄 Reversed previous settlements: ${reversed}`);
    }

    /* ----------------------------------------------------
       🏁 Apply new result and settle
    ---------------------------------------------------- */
    match.result = winner;
    match.status = "COMPLETED";
    await match.save();

    const bets = await Bet.find({ match: id, status: "PENDING" });
    let wins = 0, losses = 0, refunds = 0;

    for (const b of bets) {
      const user = await User.findById(b.user);
      if (!user) continue;

      if (winner === "DRAW") {
        const refund = b.stake || 0;
        user.walletBalance += refund;
        b.status = "REFUNDED";
        b.winAmount = 0;
        refunds++;
        await user.save();
        await b.save();
        await Transaction.create({
          user: user._id,
          type: "REVERSAL",
          amount: refund,
          meta: {
            matchId: id,
            matchName: matchTitle, // ✅ added
            reason: "Match DRAW refund",
            betId: b._id,
          },
          balanceAfter: user.walletBalance,
        });
      } else {
        const betTeam = norm(b.team ?? b.side ?? "");
        if (betTeam && betTeam === norm(winner)) {
          const credit = b.potentialWin || 0;
          user.walletBalance += credit;
          b.status = "WON";
          b.winAmount = credit;
          wins++;
          await user.save();
          await b.save();
          await Transaction.create({
            user: user._id,
            type: "BET_WIN",
            amount: credit,
            meta: {
              matchId: id,
              matchName: matchTitle, // ✅ added
              team: b.team,
              result: "WIN",
              betId: b._id,
            },
            balanceAfter: user.walletBalance,
          });
        } else {
          b.status = "LOST";
          b.winAmount = 0;
          losses++;
          await b.save();
        }
      }
    }

    console.log(`✅ Settled: ${wins} wins, ${losses} losses, ${refunds} refunds`);

    res.status(200).json({
      message: `✅ Result '${winner}' published successfully.`,
      matchId: id,
      summary: { wins, losses, refunds },
    });
  } catch (err) {
    console.error("❌ publishOrUpdateResult error:", err?.message || err);
    res.status(500).json({
      message: "Internal Server Error",
      error: err?.message || String(err),
    });
  }
};

