import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: false, lowercase: true, default: "" },
    password: { type: String, required: true, select: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isBlocked: { type: Boolean, default: false },

    // 💰 Wallet & Exposure fields
    walletBalance: { type: Number, default: 0 },
    exposure: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/* ------------------------------------------------------------------
 🔐 Password Hashing (Pre-save hook)
 Only hash when password is modified or new
------------------------------------------------------------------ */
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    console.error("❌ Error hashing password:", err.message);
    next(err);
  }
});

/* ------------------------------------------------------------------
 🧩 Instance Method — Compare Password
------------------------------------------------------------------ */
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.models.User || mongoose.model("User", userSchema);
