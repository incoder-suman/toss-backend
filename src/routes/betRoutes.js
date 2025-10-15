// ✅ src/routes/betRoutes.js
import { Router } from "express";
import {
  placeBet,
  listBets,
  myBets,
  tossHistory,
  cancelBet,
} from "../controllers/betController.js";
import { auth } from "../middleware/auth.js";

const router = Router();

/* -------------------------------------------------------
 🎯 Place a new bet (User)
------------------------------------------------------- */
router.post("/", auth("user"), placeBet);

/* -------------------------------------------------------
 ❌ Cancel an existing bet (User)
 (Refund wallet and remove bet)
------------------------------------------------------- */
router.delete("/:id", auth("user"), cancelBet);

/* -------------------------------------------------------
 👤 Get all bets of the logged-in user
 (for user panel - “My Bets”)
------------------------------------------------------- */
router.get("/my", auth("user"), myBets);

/* -------------------------------------------------------
 🕹️ Toss history (completed matches only)
 (for user-side past bets history)
------------------------------------------------------- */
router.get("/history", auth("user"), tossHistory);

/* -------------------------------------------------------
 🧾 Admin: Get all bets (with optional user filter)
 (for admin Bets Report page)
 Example: GET /api/bets?userId=<id>
------------------------------------------------------- */
router.get("/", auth("admin"), listBets);

export default router;
