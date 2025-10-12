// src/config/db.js
import mongoose from "mongoose";

/**
 * 🧩 Connect MongoDB (with retry and event logs)
 * @param {string} uri - MongoDB connection URI
 */
export const connectDB = async (uri) => {
  if (!uri) {
    console.error("❌ MONGO_URI missing in environment variables");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, {
      dbName: "tossbook",
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB initial connection error:", err.message);

    // Retry logic after 5 seconds
    setTimeout(() => connectDB(uri), 5000);
  }

  // Event listeners for stability logs
  mongoose.connection.on("connected", () => {
    console.log("📡 Mongoose connected to database");
  });

  mongoose.connection.on("error", (err) => {
    console.error("⚠️ Mongoose connection error:", err.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("🔌 Mongoose disconnected — retrying...");
  });
};
