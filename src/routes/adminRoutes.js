import express from "express";
import { auth } from "../middleware/auth.js";
import {
  getDashboardStats,
  createUser,
} from "../controllers/adminController.js";

const router = express.Router();

/* ------------------------------------------------------------------
 📊 Dashboard Stats (Admin)
------------------------------------------------------------------ */
router.get("/stats", auth("admin"), getDashboardStats);

/* ------------------------------------------------------------------
 👤 Create User (Admin Only)
------------------------------------------------------------------ */
router.post("/create-user", auth("admin"), createUser);

export default router;
