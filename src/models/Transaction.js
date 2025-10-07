// backend/models/Transaction.js
import mongoose from "mongoose";

const txnSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: [
        "DEPOSIT",        // user deposit
        "WITHDRAW",       // user withdraw
        "BET_STAKE",      // user placed a bet
        "BET_WIN",        // user won a bet
        "BET_LOST",       // ✅ added for lost bet settlement
        "REVERSAL",       // optional reversal/refund
        "ADMIN_CREDIT",   // admin manually credited tokens
      ],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    meta: {
      type: Object,
      default: {}, // { betId, matchId, note }
    },

    balanceAfter: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// ✅ Defensive fallback: auto-lowercase unknown type to safe log
txnSchema.pre("validate", function (next) {
  const allowed = [
    "DEPOSIT",
    "WITHDRAW",
    "BET_STAKE",
    "BET_WIN",
    "BET_LOST",
    "REVERSAL",
    "ADMIN_CREDIT",
  ];
  if (!allowed.includes(this.type)) {
    console.warn(`⚠️ Unknown transaction type "${this.type}", forcing to "REVERSAL"`);
    this.type = "REVERSAL"; // prevent crash in case of typo
  }
  next();
});

export default mongoose.model("Transaction", txnSchema);
