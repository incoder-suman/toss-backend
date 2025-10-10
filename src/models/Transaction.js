import mongoose from "mongoose";

const allowedTypes = [
  "DEPOSIT",
  "WITHDRAW",
  "BET_STAKE",
  "BET_WIN",
  "BET_LOST",
  "REVERSAL",
  "ADMIN_CREDIT",
  "ADMIN_DEBIT",
];

const txnSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: allowedTypes, required: true },
    amount: { type: Number, required: true },
    meta: { type: Object, default: {} },
    balanceAfter: { type: Number, default: 0 },
  },
  { timestamps: true }
);

txnSchema.pre("validate", function (next) {
  if (!allowedTypes.includes(this.type)) {
    console.warn(`⚠️ Invalid transaction type "${this.type}", defaulting to REVERSAL`);
    this.type = "REVERSAL";
  }
  next();
});

export default mongoose.model("Transaction", txnSchema);
