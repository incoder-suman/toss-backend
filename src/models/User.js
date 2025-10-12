import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: false, lowercase: true, default: "" },
    password: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isBlocked: { type: Boolean, default: false },

    // 💰 Wallet & Exposure fields
    walletBalance: { type: Number, default: 0 },
    exposure: { type: Number, default: 0 }, // ✅ Added field
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", userSchema);
