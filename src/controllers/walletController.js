// ✅ backend/src/controllers/walletController.js
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/* -------------------------------------------------------
 🧩 Helper — Safe number parse
------------------------------------------------------- */
const toNum = (v) => (isNaN(v) ? 0 : Number(v));

/* -------------------------------------------------------
 💰 DEPOSIT — (Admin or System Credit)
------------------------------------------------------- */
export const deposit = async (req, res) => {
  try {
    const { userId, amount, note } = req.body;
    const actorId = req.user?.id || null;

    if (!userId || toNum(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId or amount",
      });
    }

    const user = await User.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    user.walletBalance = toNum(user.walletBalance) + toNum(amount);
    await user.save();

    const txn = await Transaction.create({
      user: user._id,
      type: "ADMIN_CREDIT",
      amount: toNum(amount),
      meta: {
        addedBy: actorId,
        note: note || "Token added by Admin",
      },
      balanceAfter: user.walletBalance,
    });

    return res.status(200).json({
      success: true,
      message: "✅ Token added by Admin",
      walletBalance: user.walletBalance,
      transaction: txn,
    });
  } catch (error) {
    console.error("❌ Deposit error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/* -------------------------------------------------------
 💸 WITHDRAW — (Admin or System Debit)
------------------------------------------------------- */
export const withdraw = async (req, res) => {
  try {
    const { userId, amount, note } = req.body;
    const actorId = req.user?.id || null;

    if (!userId || toNum(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId or amount",
      });
    }

    const user = await User.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    if (toNum(user.walletBalance) < toNum(amount)) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
      });
    }

    user.walletBalance -= toNum(amount);
    await user.save();

    const txn = await Transaction.create({
      user: user._id,
      type: "WITHDRAW",
      amount: -toNum(amount), // negative for clarity
      meta: {
        withdrawnBy: actorId,
        note: note || "Money withdrawn from wallet",
      },
      balanceAfter: user.walletBalance,
    });

    return res.status(200).json({
      success: true,
      message: "✅ Money withdrawn successfully",
      walletBalance: user.walletBalance,
      transaction: txn,
    });
  } catch (error) {
    console.error("❌ Withdraw error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/* -------------------------------------------------------
 🧾 TRANSACTION HISTORY — (User or Admin)
------------------------------------------------------- */
export const transactions = async (req, res) => {
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

    const formatted = items.map((txn) => ({
      _id: txn._id,
      type: txn.type,
      amount: txn.amount,
      balanceAfter: txn.balanceAfter,
      createdAt: txn.createdAt,
      meta: txn.meta || {},
    }));

    return res.status(200).json({
      success: true,
      total,
      page,
      limit,
      transactions: formatted,
    });
  } catch (error) {
    console.error("❌ Transactions fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/* -------------------------------------------------------
 💼 WALLET BALANCE — (User or Admin)
 Directly uses `exposure` field (no aggregate confusion)
------------------------------------------------------- */
export const getWalletBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user?.id).select(
      "walletBalance exposure name email"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const walletBalance = toNum(user.walletBalance);
    const exposure = toNum(user.exposure);

    return res.status(200).json({
      success: true,
      walletBalance,
      exposure,
      availableBalance: walletBalance, // EXP is locked; BAL visible directly
      currency: "INR",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("❌ getWalletBalance error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
