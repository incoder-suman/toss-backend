// ✅ src/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "./config/db.js"; // ✅ make sure db.js uses: export const connectDB = async () => {}
import { errorHandler } from "./middleware/errorHandler.js";

// ✅ Route Imports
import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import matchRoutes from "./routes/matchRoutes.js";
import betRoutes from "./routes/betRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";

/* ------------------------------------------------------------------
 🧭 Path Setup (ESM Compatible)
------------------------------------------------------------------ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ------------------------------------------------------------------
 🌐 Allowed Origins Setup
------------------------------------------------------------------ */
const defaultOrigins = [
  "http://localhost:5173", // Local user
  "http://localhost:5174", // Local admin
  "https://freindstossbook.com", // Live user
  "https://www.freindstossbook.com", // www alias
  "https://admin.freindstossbook.com", // Live admin
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
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(helmet());
app.use(morgan("dev"));
app.use(compression());

/* ------------------------------------------------------------------
 🛡️ CORS Configuration
------------------------------------------------------------------ */
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow Postman / server-side
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
 ⚙️ Handle Preflight Requests (OPTIONS)
------------------------------------------------------------------ */
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    return res.sendStatus(204);
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
 ❤️ Health Check
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
 🧱 Static Files (uploads / assets)
------------------------------------------------------------------ */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ------------------------------------------------------------------
 🚫 404 Fallback — Prevent 'Cannot GET ...'
------------------------------------------------------------------ */
app.all("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
  });
});

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
