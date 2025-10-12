// src/middleware/errorHandler.js

/**
 * 🧩 Global Error Handler
 * - Catches all unhandled errors from routes/controllers
 * - Ensures consistent JSON response
 */
export const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";

  // 🪵 Detailed log (dev only)
  if (process.env.NODE_ENV !== "production") {
    console.error("❌ [ErrorHandler] =>", {
      message,
      stack: err.stack,
      path: req.originalUrl,
      method: req.method,
    });
  } else {
    // minimal log for production
    console.error(`❌ ${req.method} ${req.originalUrl} → ${message}`);
  }

  // 🧾 Standardized response
  res.status(status).json({
    success: false,
    status,
    message,
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
};
