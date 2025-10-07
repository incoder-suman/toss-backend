import mongoose from "mongoose";

const txnSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: [
        "DEPOSIT",       // user deposit
        "WITHDRAW",      // user withdraw
        "BET_STAKE",     // user placed a bet
        "BET_WIN",       // user won a bet
        "REVERSAL",      // optional reversal
        "ADMIN_CREDIT",  // ✅ added this for admin token top-up
      ],
      required: true,
    },
    amount: { type: Number, required: true },
    meta: { type: Object }, // { betId, matchId, note }
    balanceAfter: { type: Number },
  },
  { timestamps: true }
);

export default mongoose.model("Transaction", txnSchema);
