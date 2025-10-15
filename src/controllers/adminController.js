import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Match from "../models/Match.js";
import Bet from "../models/Bet.js";
import Transaction from "../models/Transaction.js";

/* ------------------------------------------------------------------
 📊 DASHBOARD STATS (Admin)
------------------------------------------------------------------ */
export const getDashboardStats = async (req, res) => {
  try {
    // Parallel fetching (faster)
    const [users, matches, activeBets] = await Promise.all([
      User.countDocuments(),
      Match.countDocuments(),
      Bet.countDocuments({ status: "PENDING" }),
    ]);

    // Total revenue calculation
    const revenueAgg = await Transaction.aggregate([
      { $match: { type: "ADMIN_CREDIT" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const revenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

    return res.status(200).json({
      success: true,
      message: "📊 Dashboard stats fetched successfully",
      stats: {
        totalUsers: users,
        totalMatches: matches,
        activeBets,
        totalRevenue: revenue,
      },
    });
  } catch (err) {
    console.error("❌ Dashboard stats error:", err);
    return res.status(500).json({
      success: false,
      message: "Error fetching dashboard stats",
      error: err.message,
    });
  }
};

/* ------------------------------------------------------------------
 👤 CREATE USER (Admin Only)
------------------------------------------------------------------ */
export const createUser = async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: "Name is required" });
    }

    // Generate safe email if missing
    const safeEmail =
      email && email.trim() !== ""
        ? email.trim().toLowerCase()
        : `${Date.now()}_${Math.random().toString(36).substring(2, 8)}@dummy.com`;

    // Check duplicate email
    const existingUser = await User.findOne({ email: safeEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }

    // Default password (plain → model pre-save hook will hash automatically)
    const defaultPassword = "Ftb@321";

    // Create new user
    const user = await User.create({
      name: name.trim().toLowerCase(),
      email: safeEmail,
      password: defaultPassword, // plain → will be auto-hashed in pre-save hook
      role: "user",
      walletBalance: 0,
      exposure: 0,
    });

    return res.status(201).json({
      success: true,
      message: "✅ User created successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        defaultPassword,
      },
    });
  } catch (err) {
    console.error("❌ Create user error:", err);
    return res.status(500).json({
      success: false,
      message: "Error creating user",
      error: err.message,
    });
  }
};
