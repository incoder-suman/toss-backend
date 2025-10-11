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
          .join(" "), // Auto-capitalize each word
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

    // 🕒 Match start time
    startAt: {
      type: Date,
      required: [true, "Match start time is required"],
    },

    // ⏳ Last time a user can place a bet
    lastBetTime: {
      type: Date,
      required: [true, "Last bet time is required"],
      validate: {
        validator: function (v) {
          return !this.startAt || v < this.startAt;
        },
        message: "Last bet time must be before match start time",
      },
    },

    // 📺 Status control
    status: {
      type: String,
      enum: [
        "UPCOMING",
        "LIVE",
        "LOCKED",
        "RESULT_DECLARED",
        "COMPLETED",
        "CANCELLED",
      ],
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
 ⏰ Auto-lock middleware (runs on find & findOne)
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
 🧠 Auto-generate title if missing
------------------------------------------------------- */
matchSchema.pre("save", function (next) {
  if (this.teams?.length === 2 && !this.title) {
    this.title = `${this.teams[0].full} vs ${this.teams[1].full}`;
  }
  next();
});

export default mongoose.models.Match || mongoose.model("Match", matchSchema);
