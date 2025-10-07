// backend/src/routes/authRoutes.js
import { Router } from "express";
import { login, register } from "../controllers/authController.js";

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user/admin
 */
router.post("/register", register);

/**
 * @route   POST /api/auth/login
 * @desc    Login existing user/admin
 */
router.post("/login", login);

export default router;
