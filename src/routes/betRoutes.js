import { Router } from "express";
import {
  placeBet,
  listBets,
  myBets,
  tossHistory, // ✅ include toss history controller
} from "../controllers/betController.js";
import { auth } from "../middleware/auth.js";

const router = Router();

// 🎯 Place a new bet (accessible by user/admin)
router.post("/", auth(["user", "admin"]), placeBet);

// 👤 Get all bets of logged-in user
router.get("/me", auth(["user", "admin"]), myBets);

// 🕹️ Get toss history (completed matches only)
router.get("/history", auth(["user", "admin"]), tossHistory);

// 🧾 Get all bets (admin only)
router.get("/", auth("admin"), listBets);

export default router;
