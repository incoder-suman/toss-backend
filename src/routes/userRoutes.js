// src/routes/userRoutes.js
import { Router } from "express";
import {
  listUsers,
  blockUser,
  unblockUser,
  createUser,
  addTokens,
  withdrawTokens,
  getUserTransactions,
} from "../controllers/userController.js"; // ✅ fixed path

import { auth } from "../middleware/auth.js";

const router = Router();

/* ------------------------------------------------------------------
 🧩 Admin → User Management Routes
------------------------------------------------------------------ */

// 1️⃣ Get all users (admin only)
router.get("/", auth("admin"), listUsers);

// 2️⃣ Create new user manually (admin)
router.post("/", auth("admin"), createUser);

// 3️⃣ Add tokens (credit wallet)
router.post("/add-tokens", auth("admin"), addTokens);

// 4️⃣ Withdraw tokens (debit wallet)
router.post("/withdraw-tokens", auth("admin"), withdrawTokens);

// 5️⃣ Fetch all transactions for a specific user
router.get("/transactions/:userId", auth("admin"), getUserTransactions);

// 6️⃣ Block user (prevent login/betting)
router.patch("/:id/block", auth("admin"), blockUser);

// 7️⃣ Unblock user
router.patch("/:id/unblock", auth("admin"), unblockUser);

export default router;
