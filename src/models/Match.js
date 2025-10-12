// ✅ backend/src/models/Match.js
import mongoose from "mongoose";

/* -------------------------------------------------------
 🧩 Team Sub-schema
------------------------------------------------------- */
const teamSchema = new mongoose.Schema(
  {
    full: {
      type: String,
      required: true,
      trim: true,
      set: (v) =>
        v
          .trim()
          .replace(/\s+/g, " ")
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" "),
    },
    short: {
      type: String,
      trim: true,
      set: (v) => v.trim().slice(0, 3).toUpperCase(),
    },
  },
  { _id: false }
);

/* -------------------------------------------------------
 🏏 Match Schema
------------------------------------------------------- */
const matchSchema = new mongoose.Schema(
  {
    // 📛 Match title
    title: {
      type: String,
      required: [true, "Match title is required"],
      trim: true,
      set: (v) =>
        v
          .trim()
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" "),
    },

    // 🕒 Optional (agar aage kabhi dubaara chahiye ho)
    startAt: {
      type: Date,
      required: false,
    },

    // ⏳ Single decisive time: iske baad bet band -> LOCKED
    lastBetTime: {
      type: Date,
      required: [true, "Last bet time is required"],
      index: true,
      // ❌ NO custom validator anymore — simple & robust
    },

    // 📺 Status control
    status: {
      type: String,
      enum: ["UPCOMING", "LIVE", "LOCKED", "COMPLETED", "CANCELLED"],
      default: "UPCOMING",
    },

    // 🎯 Result (e.g. "India", "Pakistan", or "DRAW")
    result: {
      type: String,
      default: "PENDING",
      trim: true,
    },

    // ⚖️ Odds mapping
    odds: {
      type: Map,
      of: Number,
      default: {},
    },

    // 🧩 Teams
    teams: {
      type: [teamSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === 2,
        message: "Match must have exactly two teams",
      },
    },

    // 💰 Bet limits
    minBet: {
      type: Number,
      default: 10,
      min: [1, "Minimum bet must be at least 1"],
    },
    maxBet: {
      type: Number,
      default: 1000,
      min: [1, "Maximum bet must be positive"],
    },

    // 🧑‍💼 Admin creator
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

/* -------------------------------------------------------
 ⏰ Auto-lock middleware (runs on find/findOne)
------------------------------------------------------- */
async function autoLock(docOrDocs) {
  const now = new Date();
  const docs = Array.isArray(docOrDocs) ? docOrDocs : [docOrDocs];
  for (const match of docs) {
    if (
      match &&
      match.status === "UPCOMING" &&
      match.lastBetTime &&
      new Date(match.lastBetTime) <= now
    ) {
      match.status = "LOCKED";
      await match.save();
    }
  }
}
matchSchema.post("find", autoLock);
matchSchema.post("findOne", autoLock);

/* -------------------------------------------------------
 🧠 Auto title if missing
------------------------------------------------------- */
matchSchema.pre("save", function (next) {
  if (this.teams?.length === 2 && !this.title) {
    this.title = `${this.teams[0].full} vs ${this.teams[1].full}`;
  }
  next();
});

/* -------------------------------------------------------
 🚀 Safe export — prevent cached old schema on hot reload
------------------------------------------------------- */
if (mongoose.models.Match) {
  delete mongoose.models.Match;
}
export default mongoose.model("Match", matchSchema);
