// src/app.js (or server.js)
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import connectDB from "./config/db.js";

import authRoutes from "./routes/authRoutes.js";
import matchRoutes from "./routes/matchRoutes.js";
import betRoutes from "./routes/betRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";

dotenv.config();

// ✅ Connect to MongoDB
connectDB();

// ✅ Initialize express app
const app = express();

// ✅ Security & logging middleware
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());

// ✅ Allowed origins (from .env or default)
const defaultOrigins = [
  "http://localhost:5173", // local frontend (user)
  "http://localhost:5174", // local admin
  "https://freindstossbook.com", // live user site
  "https://www.freindstossbook.com", // www alias
  "https://admin.freindstossbook.com", // live admin panel
];

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean)
  .concat(defaultOrigins);

const uniqueOrigins = [...new Set(allowedOrigins)];

console.log("✅ Allowed Origins:", uniqueOrigins);

// ✅ CORS middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow Postman, Curl, or server-side requests with no origin
      if (!origin) return callback(null, true);

      // Allow all local dev URLs (regex)
      if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);

      // Allow specific production domains
      if (allowedOrigins.includes(origin)) return callback(null, true);

      // Block anything else
      console.warn(`❌ CORS blocked for origin: ${origin}`);
      return callback(new Error(`CORS not allowed for ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
// ✅ Handle all preflight (OPTIONS) requests globally
app.options("*", cors());

// ✅ API Routes
app.use("/api/auth", authRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/bets", betRoutes);
app.use("/api/wallet", walletRoutes);

// ✅ Health check route
app.get("/api/health", (req, res) => res.json({ status: "ok", message: "TOSS backend running ✅" }));

// ✅ Start server (only if this file is entry point)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

export default app;
