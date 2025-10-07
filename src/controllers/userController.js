import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/**
 * 🧾 List users (search + pagination)
 */
export const listUsers = async (req, res, next) => {
  try {
    const { q = "", page = 1, limit = 20 } = req.query;

    const filter = q
      ? { $or: [{ name: new RegExp(q, "i") }, { email: new RegExp(q, "i") }] }
      : {};

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await User.countDocuments(filter);

    return res.json({ users, total });
  } catch (e) {
    console.error("❌ Error listing users:", e);
    next(e);
  }
};

/**
 * 🚫 Block user
 */
export const blockUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: true },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({ message: "User blocked successfully", user });
  } catch (e) {
    console.error("❌ Error blocking user:", e);
    next(e);
  }
};

/**
 * ✅ Unblock user
 */
export const unblockUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: false },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({ message: "User unblocked successfully", user });
  } catch (e) {
    console.error("❌ Error unblocking user:", e);
    next(e);
  }
};

/**
 * 🧍‍♂️ Create new user (admin only)
 */
export const createUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "All fields (name, email, password) are required" });
    }

    // 🛑 Check existing user
    const exists = await User.findOne({ email });
    if (exists)
      return res.status(400).json({ message: "Email already registered" });

    // 🔒 Hash password before saving
    const hash = await bcrypt.hash(password, 10);

    // ✅ Create new user
    const user = await User.create({
      name,
      email,
      password: hash, // store hashed password
      role: "user",
      walletBalance: 0,
    });

    return res.status(201).json({
      message: "User created successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        walletBalance: user.walletBalance,
        createdAt: user.createdAt,
      },
    });
  } catch (e) {
    console.error("❌ Error creating user:", e);
    next(e);
  }
};

/**
 * 💰 Add tokens (admin credit to user wallet)
 */
export const addTokens = async (req, res, next) => {
  try {
    const { userId, amount } = req.body;
    const adminId = req.user.id;

    // 🧮 Validate amount
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // 🧍 Find user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 💰 Update balance
    user.walletBalance += Number(amount);
    await user.save();

    // 🧾 Record transaction
    await Transaction.create({
      user: user._id,
      type: "ADMIN_CREDIT", // ✅ Make sure Transaction model supports this
      amount: Number(amount),
      meta: { addedBy: adminId },
      balanceAfter: user.walletBalance,
    });

    return res.json({
      message: "Tokens added successfully",
      newBalance: user.walletBalance,
    });
  } catch (e) {
    console.error("❌ Error adding tokens:", e);
    next(e);
  }
};
