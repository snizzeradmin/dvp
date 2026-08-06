const mongoose = require("mongoose");

let isConnected = false;

/**
 * Connect to MongoDB with automatic retry on failure.
 */
async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not defined in environment variables");

  const options = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  };

  let retries = 5;
  while (retries > 0) {
    try {
      await mongoose.connect(uri, options);
      isConnected = true;
      console.log(`[DB] Connected to MongoDB: ${uri}`);
      return;
    } catch (err) {
      retries--;
      console.error(`[DB] Connection failed (${retries} retries left):`, err.message);
      if (retries === 0) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

mongoose.connection.on("disconnected", () => {
  isConnected = false;
  console.warn("[DB] MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  console.error("[DB] MongoDB error:", err.message);
});

module.exports = connectDB;
