// src/app.js  (or server.js)
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import { connectDB } from "./config/db.js"; // ✅ make sure it's a named export
import { errorHandler } from "./middleware/errorHandler.js"; // ✅ if you have custom handler

// Route imports
import authRoutes from "./routes/authRoutes.js";
import matchRoutes from "./routes/matchRoutes.js";
import betRoutes from "./routes/betRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";

dotenv.config();

// ✅ Initialize express app
const app = express();

/* ------------------------------------------------------------------
   🚀 Connect to MongoDB (with async safety)
------------------------------------------------------------------ */
(async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
})();

/* ------------------------------------------------------------------
   🧩 Core Middlewares
------------------------------------------------------------------ */
app.set("trust proxy", 1); // For HTTPS proxy (Render, Nginx, etc.)
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(helmet());
app.use(morgan("dev"));
app.use(compression());

/* ------------------------------------------------------------------
   🌐 CORS Configuration
------------------------------------------------------------------ */
const defaultOrigins = [
  "http://localhost:5173",                 // user local
  "http://localhost:5174",                 // admin local
  "https://toss-frontend-nine.vercel.app", // live user app
  "https://toss-admin.vercel.app",         // live admin app
];

const envOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];
console.log("✅ Allowed Origins:", allowedOrigins);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // Allow Postman / mobile apps
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
    return res.status(204).send();
  }
  next();
});

/* ------------------------------------------------------------------
   📦 API Routes
------------------------------------------------------------------ */
app.use("/api/auth", authRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/bets", betRoutes);
app.use("/api/wallet", walletRoutes);

/* ------------------------------------------------------------------
   ❤️ Health Check
------------------------------------------------------------------ */
app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    message: "TOSS backend running ✅",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
);

/* ------------------------------------------------------------------
   ⚠️ Global Error Handler
------------------------------------------------------------------ */
app.use(errorHandler);

/* ------------------------------------------------------------------
   🚀 Start Server
------------------------------------------------------------------ */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running successfully on port ${PORT}`);
});

export default app;
