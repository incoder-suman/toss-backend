import mongoose from "mongoose";
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
    const { title, startAt } = req.body;
    if (!title) return res.status(400).json({ message: "Title is required" });

    const rawTeams = String(title)
      .split(/vs/i)
      .map((t) => t.trim())
      .filter(Boolean);

    if (rawTeams.length !== 2)
      return res
        .status(400)
        .json({ message: "Title must be in format: 'TeamA vs TeamB'" });

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
    if (["COMPLETED", "CANCELLED"].includes(cur))
      return res
        .status(400)
        .json({ message: `Match already ${cur.toLowerCase()}` });

    match.status = status;
    if (["UPCOMING", "LIVE"].includes(status)) match.result = "PENDING";
    await match.save();

    res.json({ message: `✅ Match status set to ${status}`, match });
  } catch (err) {
    next(err);
  }
};

/* -------------------------------------------------------
 🏁 PUBLISH or UPDATE RESULT  (Admin)
 ✅ Supports: DRAW + Reversal + Re-settlement
------------------------------------------------------- */
export const publishOrUpdateResult = async (req, res) => {
  const { id } = req.params;
  const { result } = req.body;
  if (!result) return res.status(400).json({ message: "Result is required" });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const match = await Match.findById(id).session(session);
      if (!match) throw new Error("Match not found");

      /* 🧠 Normalize teams & result */
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
        ["draw", "abandoned", "no-result"].includes(normalizedResult) ||
        normalizedResult === "nr"
          ? "DRAW"
          : teams.find(
              (t) =>
                t.full === normalizedResult ||
                t.short === normalizedResult ||
                normalizedResult === norm(t.full.slice(0, 3))
            )?.full;

      if (!winner)
        throw new Error(
          `Invalid result. Valid: ${teams
            .map((t) => `${t.full.toUpperCase()} (${t.short.toUpperCase()})`)
            .join(" or ")} or DRAW`
        );

      /* 1️⃣ Reverse old settlement if already had a result */
      const hadResultBefore =
        !!match.result && !["PENDING", "DRAW"].includes(match.result);
      if (hadResultBefore) {
        const oldBets = await Bet.find({
          match: id,
          status: { $in: ["WON", "LOST", "REFUNDED"] },
        }).session(session);

        for (const bet of oldBets) {
          const user = await User.findById(bet.user).session(session);
          if (!user) continue;

          if (bet.status === "WON" && bet.winAmount > 0) {
            user.walletBalance -= bet.winAmount;
            await user.save({ session });
            await Transaction.create(
              [
                {
                  user: user._id,
                  type: "REVERSAL",
                  amount: -bet.winAmount,
                  meta: {
                    matchId: id,
                    reason: "Reversing previous WIN due to result change",
                    betId: bet._id,
                  },
                  balanceAfter: user.walletBalance,
                },
              ],
              { session }
            );
          } else if (bet.status === "REFUNDED") {
            user.walletBalance -= bet.stake;
            await user.save({ session });
            await Transaction.create(
              [
                {
                  user: user._id,
                  type: "REVERSAL",
                  amount: -bet.stake,
                  meta: {
                    matchId: id,
                    reason: "Reversing previous REFUND due to result change",
                    betId: bet._id,
                  },
                  balanceAfter: user.walletBalance,
                },
              ],
              { session }
            );
          }
        }

        // Reset bets back to pending
        await Bet.updateMany(
          { match: id },
          { $set: { status: "PENDING", winAmount: 0 } },
          { session }
        );
      }

      /* 2️⃣ Apply new result + settle again */
      match.result = winner;
      match.status = "RESULT_DECLARED";
      await match.save({ session });

      const bets = await Bet.find({ match: id, status: "PENDING" }).session(
        session
      );

      for (const bet of bets) {
        const user = await User.findById(bet.user).session(session);
        if (!user) continue;

        if (winner === "DRAW") {
          const refund = bet.stake || 0;
          user.walletBalance += refund;
          bet.status = "REFUNDED";
          await user.save({ session });
          await bet.save({ session });

          await Transaction.create(
            [
              {
                user: user._id,
                type: "REVERSAL",
                amount: refund,
                meta: { matchId: id, reason: "Match DRAW - refund stake" },
                balanceAfter: user.walletBalance,
              },
            ],
            { session }
          );
        } else {
          const betTeam = norm(bet.team || bet.side || "");
          if (betTeam === norm(winner)) {
            const credit = bet.potentialWin || 0;
            bet.status = "WON";
            bet.winAmount = credit;
            user.walletBalance += credit;
            await user.save({ session });
            await bet.save({ session });

            await Transaction.create(
              [
                {
                  user: user._id,
                  type: "BET_WIN",
                  amount: credit,
                  meta: { matchId: id, betId: bet._id },
                  balanceAfter: user.walletBalance,
                },
              ],
              { session }
            );
          } else {
            bet.status = "LOST";
            bet.winAmount = 0;
            await bet.save({ session });
          }
        }
      }
    });

    res.status(200).json({
      message: "✅ Result published or updated successfully.",
      matchId: id,
    });
  } catch (err) {
    console.error("❌ publishOrUpdateResult error:", err.message);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: err.message });
  } finally {
    session.endSession();
  }
};
