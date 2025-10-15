import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

/* ------------------------------------------------------------------
 🔐 Helper — JWT Signer
------------------------------------------------------------------ */
const signToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || "tossbook-secret-key", // fallback for local/dev
    { expiresIn: process.env.JWT_EXPIRES || "7d" }
  );

/* ------------------------------------------------------------------
 🧍 REGISTER CONTROLLER
------------------------------------------------------------------ */
export const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !password)
      return res.status(400).json({ message: "Name and password are required" });

    const safeEmail =
      email && email.trim() !== ""
        ? email.trim().toLowerCase()
        : `${Date.now()}_${Math.random().toString(36).substring(2, 8)}@example.com`;

    const exists = await User.findOne({ email: safeEmail });
    if (exists)
      return res.status(400).json({ message: "Email already in use" });

    // 🔒 Hash password
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
    console.error("❌ Register error:", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/* ------------------------------------------------------------------
 🔑 LOGIN CONTROLLER
------------------------------------------------------------------ */
export const login = async (req, res) => {
  try {
    const { identifier, email, password } = req.body;

    // ✅ Accept either identifier OR email
    if ((!identifier && !email) || !password) {
      return res.status(400).json({
        message: "User ID or Email and password are required",
      });
    }

    // ✅ Build query dynamically
    const query = identifier
      ? {
          $or: [
            { email: identifier.toLowerCase() },
            { name: new RegExp(`^${identifier}$`, "i") },
          ],
        }
      : { email: email.toLowerCase() };

    // ✅ Fetch user & include password (select:false in schema)
    const user = await User.findOne(query).select("+password");

    if (!user) {
      return res.status(404).json({
        message: "User not found. Please check your credentials.",
      });
    }

    if (user.isBlocked) {
      return res
        .status(403)
        .json({ message: "User is blocked. Contact support." });
    }

    // ✅ Validate password safely (also handles old plain-text users)
let validPassword = false;
const entered = String(password || "").trim();
const stored = String(user.password || "");

if (stored.startsWith("$2")) {
  // already hashed → normal compare
  validPassword = await bcrypt.compare(entered, stored);
} else {
  // old plain-text → allow once then auto-hash
  validPassword = entered === stored;
  if (validPassword) {
    user.password = await bcrypt.hash(entered, 10);
    await user.save();
  }
}

if (!validPassword) {
  return res.status(400).json({ message: "Invalid password" });
}


    const token = signToken(user);

    // ✅ Send response
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
    console.error("❌ Login error:", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/* ------------------------------------------------------------------
 🧩 ME CONTROLLER
------------------------------------------------------------------ */
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user)
      return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (e) {
    console.error("❌ getMe error:", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

/* ------------------------------------------------------------------
 🔐 CHANGE PASSWORD CONTROLLER
------------------------------------------------------------------ */
export const changePassword = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { oldPassword, newPassword } = req.body;

    if (!userId || !oldPassword || !newPassword)
      return res.status(400).json({ message: "Missing required fields" });

    // include password since select:false
    const user = await User.findById(userId).select("+password");
    if (!user)
      return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Old password is incorrect" });

    const hash = await bcrypt.hash(newPassword, 10);
    user.password = hash;
    await user.save();

    res.json({ message: "✅ Password changed successfully" });
  } catch (e) {
    console.error("❌ changePassword error:", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
