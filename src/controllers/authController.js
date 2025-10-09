import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

// 🔐 Helper — JWT Signer
const signToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || "tossbook-secret-key", // fallback for local/dev
    { expiresIn: process.env.JWT_EXPIRES || "7d" }
  );

/**
 * 🧍 REGISTER CONTROLLER
 * - Email optional
 * - Auto-generates dummy email if missing
 * - Hashes password before saving
 */
export const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !password)
      return res
        .status(400)
        .json({ message: "Name and password are required" });

    // ✅ If email blank, generate a unique dummy one
    const safeEmail =
      email && email.trim() !== ""
        ? email.trim().toLowerCase()
        : `${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 8)}@example.com`;

    // ✅ Avoid duplicate emails
    const exists = await User.findOne({ email: safeEmail });
    if (exists)
      return res.status(400).json({ message: "Email already in use" });

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: name.trim(),
      email: safeEmail,
      password: hash,
      role: role || "user",
    });

    return res.status(201).json({
      message: "✅ User registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    console.error("❌ Register error:", e.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * 🔑 LOGIN CONTROLLER
 * - Accepts `identifier` (email OR username)
 * - Validates password
 * - Returns JWT + user object
 */
export const login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password)
      return res
        .status(400)
        .json({ message: "User ID or Email and password are required" });

    // ✅ Find user by email OR username
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { name: new RegExp(`^${identifier}$`, "i") },
      ],
    });

    if (!user)
      return res
        .status(404)
        .json({ message: "User not found. Please check your credentials." });

    if (user.isBlocked)
      return res
        .status(403)
        .json({ message: "User is blocked. Contact support." });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(400).json({ message: "Invalid password" });

    const token = signToken(user);

    return res.json({
      message: "✅ Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        walletBalance: user.walletBalance || 0,
      },
    });
  } catch (e) {
    console.error("❌ Login error:", e.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * 🧩 ME CONTROLLER
 * - Returns logged-in user info (without password)
 */
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user)
      return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (e) {
    console.error("❌ getMe error:", e.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
