import mongoose from "mongoose";

/* -------------------------------------------------------
 💳 Allowed transaction types
------------------------------------------------------- */
const allowedTypes = [
  "DEPOSIT",       // user self deposit (if future gateway added)
  "WITHDRAW",      // manual or admin debit
  "BET_STAKE",     // user placed a bet
  "BET_WIN",       // user won
  "BET_LOST",      // user lost
  "REVERSAL",      // cancelled / draw refund
  "ADMIN_CREDIT",  // admin added money
  "ADMIN_DEBIT",   // admin removed money
];

/* -------------------------------------------------------
 📜 Transaction Schema
------------------------------------------------------- */
const txnSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: allowedTypes,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    balanceAfter: {
      type: Number,
      default: 0,
    },

    meta: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

/* -------------------------------------------------------
 🛡️ Pre-validate safeguard
------------------------------------------------------- */
txnSchema.pre("validate", function (next) {
  if (!allowedTypes.includes(this.type)) {
    console.warn(
      `⚠️ Invalid transaction type "${this.type}", defaulting to REVERSAL`
    );
    this.type = "REVERSAL";
  }
  next();
});

export default mongoose.models.Transaction ||
  mongoose.model("Transaction", txnSchema);
