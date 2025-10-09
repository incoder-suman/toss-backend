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
        "BET_LOST",       // user lost a bet
        "REVERSAL",       // optional reversal/refund
        "ADMIN_CREDIT",   // admin manually credited tokens
        "ADMIN_DEBIT",    // ✅ admin manually debited tokens (withdraw)
      ],
      required: true,
    },

    // 🧾 amount can be positive (credit) or negative (debit)
    amount: {
      type: Number,
      required: true,
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

// ✅ Defensive fallback
txnSchema.pre("validate", function (next) {
  const allowed = [
    "DEPOSIT",
    "WITHDRAW",
    "BET_STAKE",
    "BET_WIN",
    "BET_LOST",
    "REVERSAL",
    "ADMIN_CREDIT",
    "ADMIN_DEBIT", // ✅ include here too
  ];
  if (!allowed.includes(this.type)) {
    console.warn(`⚠️ Unknown transaction type "${this.type}", forcing to "REVERSAL"`);
    this.type = "REVERSAL";
  }
  next();
});

export default mongoose.model("Transaction", txnSchema);
