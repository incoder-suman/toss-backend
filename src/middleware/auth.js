import jwt from "jsonwebtoken";

export const auth = (roles = []) => {
  if (typeof roles === "string") roles = [roles];

  return (req, res, next) => {
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.substring(7) : null;

      if (!token) {
        return res.status(401).json({ message: "No token" });
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = payload; // { id, role }

      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      next();
    } catch (e) {
      return res.status(401).json({ message: "Invalid/Expired token" });
    }
  };
};
