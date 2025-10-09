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
 * Email optional (auto-generated if blank)
 */
export const createUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !password)
      return res.status(400).json({ message: "Name and password are required" });

    // If email blank — auto-generate dummy email
    const safeEmail =
      email && email.trim() !== ""
        ? email.trim()
        : `${Date.now()}_${Math.random().toString(36).substring(2, 8)}@example.com`;

    // Check existing
    const exists = await User.findOne({ email: safeEmail });
    if (exists)
      return res.status(400).json({ message: "Email already registered" });

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: safeEmail,
      password: hash,
      role: "user",
      walletBalance: 0,
    });

    res.status(201).json({
      message: "✅ User created successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
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
 * 💰 Add tokens (admin credit)
 */
export const addTokens = async (req, res, next) => {
  try {
    const { userId, amount } = req.body;
    const adminId = req.user?.id;

    if (!userId || !amount || isNaN(amount) || amount <= 0)
      return res.status(400).json({ message: "Invalid amount" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.walletBalance += Number(amount);
    await user.save();

    await Transaction.create({
      user: user._id,
      type: "ADMIN_CREDIT",
      amount: Number(amount),
      meta: { addedBy: adminId },
      balanceAfter: user.walletBalance,
    });

    res.json({
      message: "✅ Tokens added successfully",
      newBalance: user.walletBalance,
    });
  } catch (e) {
    console.error("❌ Error adding tokens:", e);
    next(e);
  }
};

/**
 * 💸 Withdraw tokens (admin debit)
 */
export const withdrawTokens = async (req, res, next) => {
  try {
    const { userId, amount } = req.body;
    const adminId = req.user?.id;

    if (!userId || !amount || isNaN(amount) || amount <= 0)
      return res.status(400).json({ message: "Invalid amount" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.walletBalance < amount)
      return res.status(400).json({ message: "Insufficient balance" });

    user.walletBalance -= Number(amount);
    await user.save();

    await Transaction.create({
      user: user._id,
      type: "ADMIN_DEBIT",
      amount: -Number(amount), // ✅ negative for debit
      meta: { withdrawnBy: adminId },
      balanceAfter: user.walletBalance,
    });

    res.json({
      message: "✅ Tokens withdrawn successfully",
      newBalance: user.walletBalance,
    });
  } catch (e) {
    console.error("❌ Error withdrawing tokens:", e);
    next(e);
  }
};

/**
 * 📜 Get transaction history for a specific user
 */
export const getUserTransactions = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const transactions = await Transaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ transactions });
  } catch (e) {
    console.error("❌ Error fetching user transactions:", e);
    next(e);
  }
};
