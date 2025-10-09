import { Router } from "express";
import {
  listUsers,
  blockUser,
  unblockUser,
  createUser,
  addTokens,
  withdrawTokens,
  getUserTransactions,
} from "../controllers/userController.js";  // ✅ FIXED PATH

import { auth } from "../middleware/auth.js";

const router = Router();

// ✅ 1️⃣ Get user list (admin)
router.get("/", auth("admin"), listUsers);

// ✅ 2️⃣ Create user (admin)
router.post("/", auth("admin"), createUser);

// ✅ 3️⃣ Add tokens to user wallet (admin)
router.post("/add-tokens", auth("admin"), addTokens);

// ✅ 4️⃣ Withdraw tokens (admin)
router.post("/withdraw-tokens", auth("admin"), withdrawTokens);

// ✅ 5️⃣ Get transactions of user
router.get("/transactions/:userId", auth("admin"), getUserTransactions);

// ✅ 6️⃣ Block user
router.patch("/:id/block", auth("admin"), blockUser);

// ✅ 7️⃣ Unblock user
router.patch("/:id/unblock", auth("admin"), unblockUser);

export default router;
