// ✅ backend/src/routes/matchRoutes.js
import { Router } from "express";
import {
  createMatch,
  listMatches,
  updateMatch,
  updateMatchStatus,
  publishOrUpdateResult, // ✅ unified controller for result publish/update
} from "../controllers/matchController.js";
import { auth } from "../middleware/auth.js";

const router = Router();

/* ---------------------------------------------------------
 📍 PUBLIC ROUTES
--------------------------------------------------------- */

// 🧾 List all matches (for frontend users)
router.get("/", listMatches);

/* ---------------------------------------------------------
 🛡️ ADMIN ROUTES (protected)
--------------------------------------------------------- */

// 🏏 Create a new match
router.post("/", auth("admin"), createMatch);

// 📝 Update match details (title, odds, etc.)
router.put("/:id", auth("admin"), updateMatch);

// ⚙️ Update match status (UPCOMING / LIVE / COMPLETED / CANCELLED)
router.put("/:id/status", auth("admin"), updateMatchStatus);

// 🏁 Publish or Update match result + settle/reverse bets (WIN / LOSS / DRAW)
router.put("/:id/result", auth("admin"), publishOrUpdateResult);

/* ---------------------------------------------------------
 ✅ EXPORT ROUTER
--------------------------------------------------------- */
export default router;
