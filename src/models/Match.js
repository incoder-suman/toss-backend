// ✅ backend/src/models/Match.js
import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
  {
    full: {
      type: String,
      required: true,
      trim: true,
      set: (v) => v.trim().replace(/\s+/g, " "), // Clean spacing
    },
    short: {
      type: String,
      trim: true,
      set: (v) => v.trim().slice(0, 3).toUpperCase(),
    },
  },
  { _id: false }
);

const matchSchema = new mongoose.Schema(
  {
    // 🏏 Full match title (e.g. "India vs Australia")
    title: {
      type: String,
      required: [true, "Match title is required"],
      trim: true,
      set: (v) =>
        v
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" "),
    },

    // 🕒 Match start time
    startAt: {
      type: Date,
      required: [true, "Match start time is required"],
    },

    // ⏳ Betting close time (auto-lock trigger)
    lastBetTime: {
      type: Date,
      required: [true, "Last bet time is required"],
    },

    // 📺 Match status
    status: {
      type: String,
      enum: [
        "UPCOMING", // before start
        "LIVE", // running
        "LOCKED", // bets disabled
        "RESULT_DECLARED", // result published
        "COMPLETED", // finished
        "CANCELLED",
      ],
      default: "UPCOMING",
    },

    // 🎯 Match result (e.g. "India", "Australia", or "DRAW")
    result: {
      type: String,
      default: "PENDING",
      trim: true,
    },

    // ⚖️ Dynamic odds (supports both short/full team names)
    odds: {
      type: Map,
      of: Number,
      default: {},
    },

    // 🧩 Store both teams (full + short)
    teams: {
      type: [teamSchema],
      validate: {
        validator: (arr) => arr.length === 2,
        message: "A match must have exactly 2 teams",
      },
    },

    // 👤 Admin who created the match
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

/* ---------------------------------------------------------
 ⏰ Auto-lock middleware
 - Runs every time a match is fetched from DB
 - Auto-locks if lastBetTime < current time
--------------------------------------------------------- */
matchSchema.post("find", async function (docs) {
  const now = new Date();
  for (const match of docs) {
    if (
      match.status === "UPCOMING" &&
      match.lastBetTime &&
      new Date(match.lastBetTime) <= now
    ) {
      match.status = "LOCKED";
      await match.save();
    }
  }
});

/* ---------------------------------------------------------
 🧠 Optional helper: auto-format title from teams
--------------------------------------------------------- */
matchSchema.pre("save", function (next) {
  if (this.teams?.length === 2 && !this.title) {
    this.title = `${this.teams[0].full} vs ${this.teams[1].full}`;
  }
  next();
});

export default mongoose.models.Match || mongoose.model("Match", matchSchema);
