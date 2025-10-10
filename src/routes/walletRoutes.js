import { Router } from "express";
import {
  deposit,
  withdraw,
  transactions,
} from "../controllers/walletController.js";
import { auth } from "../middleware/auth.js";
import User from "../models/User.js";

const router = Router();

/* ---------------------------------------------------------
 💰 ADMIN: Deposit tokens to user wallet
--------------------------------------------------------- */
router.post("/deposit", auth("admin"), deposit);

/* ---------------------------------------------------------
 💸 ADMIN: Withdraw tokens from user wallet
--------------------------------------------------------- */
router.post("/withdraw", auth("admin"), withdraw);

/* ---------------------------------------------------------
 🧾 USER/ADMIN: Get all transactions for logged-in user
--------------------------------------------------------- */
router.get("/transactions", auth(["user", "admin"]), transactions);

/* ---------------------------------------------------------
 💼 USER/ADMIN: Get current wallet balance
--------------------------------------------------------- */
router.get("/balance", auth(["user", "admin"]), async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("walletBalance name email");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      success: true,
      walletBalance: user.walletBalance || 0,
      currency: "INR",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching wallet balance:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
