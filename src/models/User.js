import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
      default: "",
    },
    password: { type: String, required: true, select: false }, // 🔒 select false = hide by default
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
 Only hash when password is new or modified
------------------------------------------------------------------ */
userSchema.pre("save", async function (next) {
  try {
    if (!this.isModified("password")) return next();
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
  return bcrypt.compare(enteredPassword, this.password);
};

/* ------------------------------------------------------------------
 ✅ Export model safely (avoids overwrite in hot reload)
------------------------------------------------------------------ */
export default mongoose.models.User || mongoose.model("User", userSchema);
