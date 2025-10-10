import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/* -------------------------------------------------------
 💰 Deposit (user or admin credit)
------------------------------------------------------- */
export const deposit = async (req, res, next) => {
  try {
    const { userId, amount, note } = req.body;
    const actorId = req.user?.id || null; // who triggered deposit

    if (!userId || !amount || isNaN(amount) || amount <= 0)
      return res.status(400).json({ message: "Invalid amount or user ID" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.walletBalance += Number(amount);
    await user.save();

    const txn = await Transaction.create({
      user: user._id,
      type: "DEPOSIT",
      amount: Number(amount),
      meta: { addedBy: actorId, note },
      balanceAfter: user.walletBalance,
    });

    res.json({
      message: "✅ Deposit successful",
      balance: user.walletBalance,
      txn,
    });
  } catch (e) {
    console.error("❌ Deposit error:", e);
    next(e);
  }
};

/* -------------------------------------------------------
 💸 Withdraw (user or admin debit)
------------------------------------------------------- */
export const withdraw = async (req, res, next) => {
  try {
    const { userId, amount, note } = req.body;
    const actorId = req.user?.id || null;

    if (!userId || !amount || isNaN(amount) || amount <= 0)
      return res.status(400).json({ message: "Invalid amount or user ID" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.walletBalance < amount)
      return res.status(400).json({ message: "Insufficient wallet balance" });

    user.walletBalance -= Number(amount);
    await user.save();

    const txn = await Transaction.create({
      user: user._id,
      type: "WITHDRAW",
      amount: -Number(amount),
      meta: { withdrawnBy: actorId, note },
      balanceAfter: user.walletBalance,
    });

    res.json({
      message: "✅ Withdrawal successful",
      balance: user.walletBalance,
      txn,
    });
  } catch (e) {
    console.error("❌ Withdraw error:", e);
    next(e);
  }
};

/* -------------------------------------------------------
 🧾 Fetch Transaction History
------------------------------------------------------- */
export const transactions = async (req, res, next) => {
  try {
    const userId = req.query.userId || req.user?.id;
    const { page = 1, limit = 20 } = req.query;

    const filter = userId ? { user: userId } : {};

    const items = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Transaction.countDocuments(filter);

    res.json({ items, total });
  } catch (e) {
    console.error("❌ Transactions error:", e);
    next(e);
  }
};
