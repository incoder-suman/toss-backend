import { Router } from "express";
import {
  listUsers,
  blockUser,
  unblockUser,
  createUser,
  addTokens,
  withdrawTokens,
  getUserTransactions,
} from "../controller/userController.js"; // ✅ check your folder name — 'controller' not 'controllers'
import { auth } from "../middleware/auth.js";

const router = Router();

// ✅ 1️⃣ List all users (Admin only)
router.get("/", auth("admin"), listUsers);

// ✅ 2️⃣ Create a new user (Admin only)
router.post("/", auth("admin"), createUser);

// ✅ 3️⃣ Add tokens (Admin credit)
router.post("/add-tokens", auth("admin"), addTokens);

// ✅ 4️⃣ Withdraw tokens (Admin debit)
router.post("/withdraw-tokens", auth("admin"), withdrawTokens);

// ✅ 5️⃣ Get user transaction history
router.get("/transactions/:userId", auth("admin"), getUserTransactions);

// ✅ 6️⃣ Block user
router.patch("/:id/block", auth("admin"), blockUser);

// ✅ 7️⃣ Unblock user
router.patch("/:id/unblock", auth("admin"), unblockUser);

export default router;
