import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Helper function to sign JWT
const signToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '7d' }
  );

// REGISTER CONTROLLER
export const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    // Check if user already exists
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'Email already in use' });

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Create new user
    const user = await User.create({
      name,
      email,
      password: hash,
      role: role || 'user',
    });

    return res.status(201).json({
      message: 'User registered successfully',
      id: user._id,
    });
  } catch (e) {
    next(e); // errorHandler middleware catch karega
  }
};

// LOGIN CONTROLLER
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check if blocked
    if (user.isBlocked)
      return res.status(403).json({ message: 'User is blocked. Contact support.' });

    // Compare password
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });

    // Sign token
    const token = signToken(user);

    // Return response
    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        walletBalance: user.walletBalance || 0,
      },
    });
  } catch (e) {
    next(e);
  }
};
