// ✅ backend/src/routes/walletRoutes.js
import { Router } from "express";
import {
  deposit,
  withdraw,
  transactions,
  getWalletBalance, // ✅ added from controller for clean separation
} from "../controllers/walletController.js";
import { auth } from "../middleware/auth.js";

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
 🧾 USER/ADMIN: Get all transactions
 - user → own transactions
 - admin → can pass ?userId=<id>
--------------------------------------------------------- */
router.get("/transactions", auth(["user", "admin"]), transactions);

/* ---------------------------------------------------------
 💼 USER/ADMIN: Get current wallet balance
--------------------------------------------------------- */
router.get("/balance", auth(["user", "admin"]), getWalletBalance);

export default router;
