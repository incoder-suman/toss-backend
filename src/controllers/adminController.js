import User from "../models/User.js";
import Match from "../models/Match.js";
import Bet from "../models/Bet.js";
import Transaction from "../models/Transaction.js";

export const getDashboardStats = async (req, res) => {
  try {
    const users = await User.countDocuments();
    const matches = await Match.countDocuments();
    const activeBets = await Bet.countDocuments({ status: "PENDING" });

    // calculate revenue
    const revenueAgg = await Transaction.aggregate([
      { $match: { type: "ADMIN_CREDIT" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const revenue = revenueAgg[0]?.total || 0;

    res.json({ users, matches, activeBets, revenue });
  } catch (err) {
    console.error("❌ Dashboard stats error:", err);
    res.status(500).json({ message: "Error fetching dashboard stats" });
  }
};
