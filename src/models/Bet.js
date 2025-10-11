import mongoose from "mongoose";

const betSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      required: true,
    },

    // ✅ new unified team field (store team name or side)
    team: { type: String, trim: true },

    // 🧩 backward compatibility (some old data used side)
    side: { type: String, trim: true },

    stake: {
      type: Number,
      required: true,
      min: 1,
    },
    potentialWin: {
      type: Number,
      required: true,
      min: 0,
    },

    // ✅ added for settlements
    winAmount: {
      type: Number,
      default: 0,
    },

    // ✅ added for draw / refund support
    status: {
      type: String,
      enum: ["PENDING", "WON", "LOST", "REFUNDED", "CANCELLED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

export default mongoose.models.Bet || mongoose.model("Bet", betSchema);
