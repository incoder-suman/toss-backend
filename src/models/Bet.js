import mongoose from "mongoose";

const betSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    match: { type: mongoose.Schema.Types.ObjectId, ref: "Match", required: true },

    // ✅ allow any team name, not just HEADS/TAILS
    side: { type: String, required: true, trim: true },

    stake: { type: Number, required: true, min: 1 },
    potentialWin: { type: Number, required: true },

    status: {
      type: String,
      enum: ["PENDING", "WON", "LOST", "CANCELLED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

const Bet = mongoose.models.Bet || mongoose.model("Bet", betSchema);
export default Bet;
