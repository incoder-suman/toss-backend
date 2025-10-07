// models/Match.js
import mongoose from "mongoose";

const matchSchema = new mongoose.Schema(
  {
    // 🏏 Match title
    title: {
      type: String,
      required: [true, "Match title is required"],
      trim: true,
    },

    // 🕒 Match start time
    startAt: {
      type: Date,
      required: [true, "Match start time is required"],
    },

    // 📺 Match status (for live control)
    status: {
      type: String,
      enum: ["UPCOMING", "LIVE", "LOCKED", "COMPLETED", "CANCELLED"],
      default: "UPCOMING",
    },

    // 🎯 Toss result (team name like "India" or "Australia")
    result: {
      type: String,
      default: "PENDING",
    },

    // ⚖️ Dynamic odds (supports team names)
    odds: {
      type: Map,
      of: Number, // e.g. { "India": 1.9, "Australia": 1.9 }
      default: {},
    },

    // 🧑‍💼 Optional: admin reference
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Match || mongoose.model("Match", matchSchema);
