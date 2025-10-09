import express from "express";
import { getDashboardStats } from "../controllers/adminController.js"; // ✅ make sure folder name is plural (controllers)
import { auth } from "../middleware/auth.js"; // ✅ fixed filename and path

const router = express.Router();

// ✅ Admin-only dashboard stats route
router.get("/stats", auth("admin"), getDashboardStats);

export default router;