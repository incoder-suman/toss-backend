// src/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { connectDB } from "./config/db.js";
import { errorHandler } from "./middleware/errorHandler.js";

// Route imports
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import matchRoutes from "./routes/matchRoutes.js";
import betRoutes from "./routes/betRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";

const app = express();

/* ------------------------------------------------------------------
   ✅ Allowed Origins Setup
------------------------------------------------------------------ */
const defaultOrigins = [
  "http://localhost:5173",                 // local frontend
  "http://localhost:5174",                 // local admin
  "https://toss-frontend-nine.vercel.app", // live frontend
  "https://toss-admin.vercel.app",         // live admin
];

const envOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];
console.log("✅ Allowed Origins:", allowedOrigins);

/* ------------------------------------------------------------------
   ✅ Middlewares
------------------------------------------------------------------ */
app.use(express.json());
app.use(helmet());
app.use(morgan("dev"));

/* ------------------------------------------------------------------
   ✅ CORS Configuration
------------------------------------------------------------------ */
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow tools without origin header (Postman, curl, etc.)
      if (!origin) return callback(null, true);

      // Allow localhost:* automatically for dev
      if (/^http:\/\/localhost(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      // Check against list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error(`❌ CORS blocked for origin: ${origin}`);
      return callback(new Error(`CORS not allowed for ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ✅ Pre-flight requests
app.options("*", cors());

/* ------------------------------------------------------------------
   ✅ Routes
------------------------------------------------------------------ */
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/bets", betRoutes);
app.use("/api/wallet", walletRoutes);

// Health check
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Global error handler
app.use(errorHandler);

/* ------------------------------------------------------------------
   ✅ Start Server
------------------------------------------------------------------ */
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    app.listen(PORT, () =>
      console.log(`🚀 Server running successfully on port ${PORT}`)
    );
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
})();
