import { Router } from "express";
import {
  deposit,
  withdraw,
  transactions,
} from "../controllers/walletController.js";
import { auth } from "../middleware/auth.js";
import User from "../models/User.js";

const router = Router();

// 💰 Admin can manually deposit/withdraw tokens for users
router.post("/deposit", auth("admin"), deposit);
router.post("/withdraw", auth("admin"), withdraw);

// 🧾 Fetch all wallet transactions
router.get("/transactions", auth(["user", "admin"]), transactions);

// 👇 ✅ NEW: Get current logged-in user's wallet balance
router.get("/balance", auth(["user", "admin"]), async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      walletBalance: user.walletBalance,
      currency: "INR", // base currency
    });
  } catch (e) {
    next(e);
  }
});

export default router;
