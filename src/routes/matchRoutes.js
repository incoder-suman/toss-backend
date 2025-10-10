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

/* ---------------------------------------------------------
 📍 PUBLIC ROUTES
--------------------------------------------------------- */

// 🧾 List all matches (frontend users)
router.get("/", listMatches);

/* ---------------------------------------------------------
 🛡️ ADMIN ROUTES (protected by auth middleware)
--------------------------------------------------------- */

// 🏏 Create a new match
router.post("/", auth("admin"), createMatch);

// 📝 Update match details (title, odds, etc.)
router.put("/:id", auth("admin"), updateMatch);

// ⚙️ Update match status (UPCOMING / LIVE / COMPLETED / CANCELLED)
router.put("/:id/status", auth("admin"), updateMatchStatus);

// 🏁 Finalize match result + settle bets (WIN / LOSS / DRAW)
router.put("/:id/result", auth("admin"), setResult);

/* ---------------------------------------------------------
 ✅ EXPORT ROUTER
--------------------------------------------------------- */
export default router;
