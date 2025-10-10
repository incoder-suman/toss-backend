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
const defaultOrigins = [
  "http://localhost:5173",                 // Local frontend (User)
  "http://localhost:5174",                 // Local admin
  "https://toss-frontend-nine.vercel.app", // Deployed frontend
  "https://toss-admin.vercel.app",         // Deployed admin
];

const envOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];
console.log("✅ Allowed Origins:", allowedOrigins);

/* ------------------------------------------------------------------
   🧩 Core Middlewares
------------------------------------------------------------------ */
app.set("trust proxy", 1); // Render / reverse proxy safety
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
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // Allow Postman / curl
      if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      console.warn(`❌ CORS blocked for origin: ${origin}`);
      return callback(new Error(`CORS not allowed for ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

/* ------------------------------------------------------------------
   ⚙️ Handle Preflight (OPTIONS) Requests
------------------------------------------------------------------ */
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    return res.status(204).send(); // success but no body
  }
  next();
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
app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    uptime: process.uptime(),
    message: "TOSS backend running ✅",
    timestamp: new Date().toISOString(),
  })
);

/* ------------------------------------------------------------------
   🧱 Serve Static (Optional for uploads / assets)
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
    app.listen(PORT, () => {
      console.log(`🚀 Server running successfully on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  }
})();
