import { Router } from 'express';
import { login, register } from '../controllers/authController.js';
import { auth } from '../middleware/auth.js';


const router = Router();
router.post('/register', register); // admin can create users/admins
router.post('/login', login);
export default router;