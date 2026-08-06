require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const helmet   = require("helmet");
const morgan   = require("morgan");
const path     = require("path");

const connectDB = require("./config/db");

// ── Routes ────────────────────────────────────────────────────────────────────
const authRoutes       = require("./routes/auth");
const electionRoutes   = require("./routes/elections");
const candidateRoutes  = require("./routes/candidates");
const voterRoutes      = require("./routes/voters");
const blockchainRoutes = require("./routes/blockchain");

// ── App setup ─────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com", "cdn.jsdelivr.net"],
      styleSrc:   ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      fontSrc:    ["'self'", "fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "https:", "api.dicebear.com"],
      connectSrc: ["'self'", "http://127.0.0.1:8545", "ws://127.0.0.1:8545"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "null", // for file:// protocol during development
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

// ── Logging ───────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("combined"));
}

// ── Static frontend ───────────────────────────────────────────────────────────
// Serve all HTML, CSS, JS files from the parent directory
app.use(express.static(path.join(__dirname, "..")));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth",       authRoutes);
app.use("/api/elections",  electionRoutes);
app.use("/api/candidates", candidateRoutes);
app.use("/api/voters",     voterRoutes);
app.use("/api/blockchain", blockchainRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
  }
  // For HTML routes, serve the landing page
  res.sendFile(path.join(__dirname, "../voting.html"));
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error("[Server] Unhandled error:", err);
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === "production"
      ? "An unexpected error occurred"
      : err.message,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`\n┌────────────────────────────────────────┐`);
      console.log(`│  Aegis Vote Server running             │`);
      console.log(`│  http://localhost:${PORT}                 │`);
      console.log(`│  Environment: ${process.env.NODE_ENV?.padEnd(25)}│`);
      console.log(`└────────────────────────────────────────┘\n`);
    });
  } catch (err) {
    console.error("[Server] Failed to start:", err);
    process.exit(1);
  }
}

start();

module.exports = app; // for tests
