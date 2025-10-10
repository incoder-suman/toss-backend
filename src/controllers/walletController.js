import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/* -------------------------------------------------------
 💰 DEPOSIT — (admin or system credit)
------------------------------------------------------- */
export const deposit = async (req, res, next) => {
  try {
    const { userId, amount, note } = req.body;
    const actorId = req.user?.id || null; // who triggered deposit

    if (!userId || !amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount or user ID" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // update wallet balance
    user.walletBalance = (user.walletBalance || 0) + Number(amount);
    await user.save();

    // record transaction
    const txn = await Transaction.create({
      user: user._id,
      type: "DEPOSIT",
      amount: Number(amount),
      meta: { addedBy: actorId, note: note || "Manual deposit" },
      balanceAfter: user.walletBalance,
    });

    return res.status(200).json({
      success: true,
      message: "✅ Deposit successful",
      walletBalance: user.walletBalance,
      transaction: txn,
    });
  } catch (error) {
    console.error("❌ Deposit error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/* -------------------------------------------------------
 💸 WITHDRAW — (admin or system debit)
------------------------------------------------------- */
export const withdraw = async (req, res, next) => {
  try {
    const { userId, amount, note } = req.body;
    const actorId = req.user?.id || null;

    if (!userId || !amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount or user ID" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if ((user.walletBalance || 0) < Number(amount)) {
      return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
    }

    // update wallet
    user.walletBalance -= Number(amount);
    await user.save();

    // record transaction
    const txn = await Transaction.create({
      user: user._id,
      type: "WITHDRAW",
      amount: -Number(amount),
      meta: { withdrawnBy: actorId, note: note || "Manual withdraw" },
      balanceAfter: user.walletBalance,
    });

    return res.status(200).json({
      success: true,
      message: "✅ Withdrawal successful",
      walletBalance: user.walletBalance,
      transaction: txn,
    });
  } catch (error) {
    console.error("❌ Withdraw error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

/* -------------------------------------------------------
 🧾 FETCH TRANSACTION HISTORY (user or admin)
------------------------------------------------------- */
export const transactions = async (req, res, next) => {
  try {
    const userId = req.query.userId || req.user?.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const filter = userId ? { user: userId } : {};

    const [items, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Transaction.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page,
      limit,
      transactions: items,
    });
  } catch (error) {
    console.error("❌ Transactions fetch error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};
