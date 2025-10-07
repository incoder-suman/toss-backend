import { Router } from "express";
import {
  createMatch,
  listMatches,
  updateMatch,
  updateMatchStatus,
  setResult,
} from "../controllers/matchController.js";
import { auth } from "../middleware/auth.js";

const router = Router();

// Public — list all matches (frontend)
router.get("/", listMatches);

// Admin — create new match
router.post("/", auth("admin"), createMatch);

// Admin — update full match details (title, odds, etc)
router.put("/:id", auth("admin"), updateMatch);

// Admin — change match status (UPCOMING / LIVE / COMPLETED / CANCELLED)
router.put("/:id/status", auth("admin"), updateMatchStatus);

// ✅ Admin — finalize match result + settle bets
router.put("/:id/result", auth("admin"), setResult);

export default router;
