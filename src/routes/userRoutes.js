import { Router } from "express";
import {
  listUsers,
  blockUser,
  unblockUser,
  createUser,
  addTokens,
} from "../controllers/userController.js";
import { auth } from "../middleware/auth.js";

const router = Router();

// ✅ 1️⃣ Get user list (admin)
router.get("/", auth("admin"), listUsers);

// ✅ 2️⃣ Create user (admin)
router.post("/", auth("admin"), createUser);

// ✅ 3️⃣ Add tokens to user wallet (admin)
router.post("/add-tokens", auth("admin"), addTokens);

// ✅ 4️⃣ Block user
router.patch("/:id/block", auth("admin"), blockUser);

// ✅ 5️⃣ Unblock user
router.patch("/:id/unblock", auth("admin"), unblockUser);

export default router;
