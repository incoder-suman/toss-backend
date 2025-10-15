// backend/src/middleware/auth.js
import jwt from "jsonwebtoken";

/**
 * 🔐 Auth Middleware
 * - Verifies JWT from Authorization header
 * - Optionally restricts by role(s)
 * - Attaches decoded user info to req.user
 *
 * @param {string|string[]} roles - Optional allowed roles (e.g. 'admin' or ['admin', 'user'])
 */
export const auth = (roles = []) => {
  // Convert single role string into array
  if (typeof roles === "string") roles = [roles];

  return (req, res, next) => {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.split(" ")[1] : null;

      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized — Token missing",
        });
      }

      // ✅ Verify JWT
      const secret = process.env.JWT_SECRET || "tossbook-secret-key";
      const payload = jwt.verify(token, secret);

      if (!payload?.id) {
        return res.status(401).json({
          success: false,
          message: "Invalid token payload",
        });
      }

      // ✅ Attach payload to req.user
      req.user = {
        id: payload.id,
        role: payload.role || "user",
        name: payload.name || null,
        email: payload.email || null,
      };

      // ✅ Optional role restriction
      if (roles.length > 0 && !roles.includes(req.user.role)) {
        console.warn(
          `🚫 Access denied: ${req.user.role} tried to access restricted route (${roles.join(",")})`
        );
        return res.status(403).json({
          success: false,
          message: "Forbidden — Admins only or insufficient privileges",
        });
      }

      next();
    } catch (err) {
      console.error("❌ Auth middleware error:", err.message);
      return res.status(401).json({
        success: false,
        message: "Unauthorized — Invalid or expired token",
      });
    }
  };
};
