import mongoose from "mongoose";

const betSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    match: { type: mongoose.Schema.Types.ObjectId, ref: "Match", required: true },

    team: { type: String, trim: true },  // unified team
    side: { type: String, trim: true },  // backward compat

    stake: { type: Number, required: true, min: 1 },
    potentialWin: { type: Number, required: true, min: 0 },

    winAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["PENDING", "WON", "LOST", "REFUNDED", "CANCELLED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

/* 🔎 Optional but recommended indexes (faster admin report) */
betSchema.index({ createdAt: -1 });
betSchema.index({ user: 1, createdAt: -1 });
betSchema.index({ match: 1, createdAt: -1 });
betSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.Bet || mongoose.model("Bet", betSchema);
