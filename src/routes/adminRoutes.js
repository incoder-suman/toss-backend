import express from "express";
import { getDashboardStats } from "../controller/adminController.js";
import { verifyAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/stats", verifyAdmin, getDashboardStats);

export default router;
