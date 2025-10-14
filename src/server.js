// src/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";

import { connectDB } from "./config/db.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Route imports
import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import matchRoutes from "./routes/matchRoutes.js";
import betRoutes from "./routes/betRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";

// Utilities for dirname (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ------------------------------------------------------------------
 🌐 Allowed Origins Setup
------------------------------------------------------------------ */
const allowedOrigins = [
  "http://localhost:5173", // Local user frontend
  "http://localhost:5174", // Local admin frontend
  "https://toss-frontend-nine.vercel.app", // ✅ Deployed user panel
  "https://toss-admin.vercel.app", // ✅ Deployed admin panel
];

console.log("✅ Allowed Origins:", allowedOrigins);

/* ------------------------------------------------------------------
 🧩 Core Middlewares
------------------------------------------------------------------ */
app.set("trust proxy", 1); // Required for Render/Vercel HTTPS proxy
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(helmet());
app.use(morgan("dev"));
app.use(compression());

/* ------------------------------------------------------------------
 🛡️ Global CORS Configuration
------------------------------------------------------------------ */
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow same-origin, Postman, or server-to-server (no origin header)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        console.warn("❌ Blocked by CORS:", origin);
        return callback(new Error(`CORS not allowed for ${origin}`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
    ],
  })
);

// ✅ Important: Explicitly handle OPTIONS preflight
app.options("/*", (req, res) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    return res.sendStatus(200);
  } else {
    return res.sendStatus(403);
  }
});
/* ------------------------------------------------------------------
 🚏 API Routes
------------------------------------------------------------------ */
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/bets", betRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/admin", adminRoutes);

/* ------------------------------------------------------------------
 ❤️ Health Check Endpoint
------------------------------------------------------------------ */
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    message: "✅ Toss backend running",
    timestamp: new Date().toISOString(),
  });
});

/* ------------------------------------------------------------------
 🧱 Serve Static (uploads / assets)
------------------------------------------------------------------ */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ------------------------------------------------------------------
 ⚠️ Global Error Handler
------------------------------------------------------------------ */
app.use(errorHandler);

/* ------------------------------------------------------------------
 🚀 Start Server
------------------------------------------------------------------ */
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

(async () => {
  try {
    await connectDB(MONGO_URI);
    app.listen(PORT, () =>
      console.log(`🚀 Server running on port ${PORT} (Render Production)`)
    );
  } catch (err) {
    console.error("❌ Server startup failed:", err.message);
    process.exit(1);
  }
})();
