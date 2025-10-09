// backend/src/routes/authRoutes.js
import { Router } from "express";
import { login, register, getMe } from "../controllers/authController.js";
import { auth } from "../middleware/auth.js"; // ✅ for protected routes

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user/admin
 * @access  Public
 */
router.post("/register", register);

/**
 * @route   POST /api/auth/login
 * @desc    Login existing user/admin
 * @access  Public
 */
router.post("/login", login);

/**
 * @route   GET /api/auth/me
 * @desc    Get logged-in user details
 * @access  Private
 */
router.get("/me", auth(), getMe);

export default router;
