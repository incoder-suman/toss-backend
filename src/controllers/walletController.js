import User from '../models/User.js';
import Transaction from '../models/Transaction.js';


export const deposit = async (req, res, next) => {
try {
const { userId, amount, note } = req.body; // Admin credits or payment gateway webhook
if (amount <= 0) return res.status(400).json({ message: 'Invalid amount' });
const user = await User.findById(userId);
if (!user) return res.status(404).json({ message: 'User not found' });
user.walletBalance += amount;
await user.save();
const txn = await Transaction.create({ user: user._id, type: 'DEPOSIT', amount, meta: { note }, balanceAfter: user.walletBalance });
res.json({ balance: user.walletBalance, txn });
} catch (e) { next(e); }
};

export const withdraw = async (req, res, next) => {
try {
const { userId, amount, note } = req.body; // Admin approves withdrawal
if (amount <= 0) return res.status(400).json({ message: 'Invalid amount' });
const user = await User.findById(userId);
if (!user) return res.status(404).json({ message: 'User not found' });
if (user.walletBalance < amount) return res.status(400).json({ message: 'Insufficient balance' });
user.walletBalance -= amount;
await user.save();
const txn = await Transaction.create({ user: user._id, type: 'WITHDRAW', amount: -amount, meta: { note }, balanceAfter: user.walletBalance });
res.json({ balance: user.walletBalance, txn });
} catch (e) { next(e); }
};

export const transactions = async (req, res, next) => {
try {
const { userId, page = 1, limit = 20 } = req.query;
const filter = userId ? { user: userId } : {};
const items = await Transaction.find(filter)
.sort({ createdAt: -1 })
.skip((page - 1) * limit)
.limit(Number(limit));
const total = await Transaction.countDocuments(filter);
res.json({ items, total });
} catch (e) { next(e); }
};