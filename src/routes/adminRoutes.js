import express from "express";
import { getDashboardStats } from "../controllers/adminController.js"; // ✅ FIXED (folder name plural)
import { verifyAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ Route for Admin Dashboard Stats
router.get("/stats", verifyAdmin, getDashboardStats);

export default router;
