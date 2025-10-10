// ✅ src/routes/betRoutes.js
import { Router } from "express";
import {
  placeBet,
  listBets,
  myBets,
  tossHistory,
} from "../controllers/betController.js";
import { auth } from "../middleware/auth.js";

const router = Router();

/**
 * 🎯 Place a new bet
 * Access: user or admin
 */
router.post("/", auth("user"), placeBet);

/**
 * 👤 Get all bets of logged-in user
 */
router.get("/me", auth("user"), myBets);

/**
 * 🕹️ Toss history (completed matches only)
 */
router.get("/history", auth("user"), tossHistory);

/**
 * 🧾 Admin: List all bets
 */
router.get("/", auth("admin"), listBets);

export default router;
