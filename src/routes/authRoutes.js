// backend/src/routes/authRoutes.js
import { Router } from "express";
import {
  login,
  register,
  getMe,
  changePassword,
} from "../controllers/authController.js";
import { auth } from "../middleware/auth.js"; // ✅ middleware for protected routes

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user or admin
 * @access  Public
 */
router.post("/register", register);

/**
 * @route   POST /api/auth/login
 * @desc    Login existing user or admin
 * @access  Public
 */
router.post("/login", login);

/**
 * @route   GET /api/auth/me
 * @desc    Get logged-in user details
 * @access  Private
 */
router.get("/me", auth(), getMe);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change password for logged-in user
 * @access  Private
 */
router.put("/change-password", auth(), changePassword);

export default router;
