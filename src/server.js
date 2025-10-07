// src/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { connectDB } from "./config/db.js";
import { errorHandler } from "./middleware/errorHandler.js";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import matchRoutes from "./routes/matchRoutes.js";
import betRoutes from "./routes/betRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";

const app = express();

// ✅ Allowed origins from .env or default list
const defaultOrigins = [
  "http://localhost:5173",                 // local frontend
  "http://localhost:5174",                 // local admin
  "https://toss-frontend-nine.vercel.app", // live frontend
  "https://toss-admin.vercel.app",         // live admin
];

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean)
  .concat(defaultOrigins);

// ✅ Remove duplicates
const uniqueOrigins = [...new Set(allowedOrigins)];

console.log("✅ Allowed Origins:", uniqueOrigins);

// Middleware
app.use(express.json());
app.use(helmet());
app.use(morgan("dev"));

// ✅ Global CORS configuration
app.use(
  cors({
    origin: function (origin, callback) {
      // ⚙️ Allow requests without origin (Postman, mobile apps, curl, etc.)
      if (!origin) return callback(null, true);

      // ⚙️ Allow all localhost ports dynamically (useful for dev)
      if (/^http:\/\/localhost(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }

      // ⚙️ Check against allowed list
      if (uniqueOrigins.includes(origin)) {
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

// ✅ Handle all preflight requests globally
app.options("*", cors());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/bets", betRoutes);
app.use("/api/wallet", walletRoutes);

// Health check route
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Error handler
app.use(errorHandler);

// ✅ Start server
const PORT = process.env.PORT || 5000;
connectDB(process.env.MONGO_URI).then(() => {
  app.listen(PORT, () =>
    console.log(`🚀 Server running on http://localhost:${PORT}`)
  );
});
