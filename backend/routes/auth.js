const express = require("express");
const router  = express.Router();
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { body } = require("express-validator");

const User     = require("../models/User");
const Log      = require("../models/Log");
const validate = require("../middleware/validate");
const authenticate = require("../middleware/authenticate");

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Full name is required")
      .isLength({ min: 2, max: 100 }).withMessage("Name must be 2–100 characters"),
    body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
      .matches(/[A-Z]/).withMessage("Password must contain an uppercase letter")
      .matches(/[0-9]/).withMessage("Password must contain a number"),
    body("walletAddress")
      .trim()
      .matches(/^0x[a-fA-F0-9]{40}$/).withMessage("Valid Ethereum wallet address required"),
    body("idNumber").trim().notEmpty().withMessage("Identification number is required"),
  ],
  validate,
  async (req, res) => {
    try {
      const { name, email, password, walletAddress, idNumber } = req.body;

      // Check for existing email
      const emailExists = await User.findOne({ email: email.toLowerCase() });
      if (emailExists) {
        return res.status(409).json({ success: false, message: "Email address already registered" });
      }

      // Check for existing wallet address
      const walletExists = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
      if (walletExists) {
        return res.status(409).json({ success: false, message: "Wallet address already registered" });
      }

      // Hash password (cost factor 12 for strong security)
      const passwordHash = await bcrypt.hash(password, 12);

      const user = await User.create({
        name,
        email: email.toLowerCase(),
        passwordHash,
        walletAddress: walletAddress.toLowerCase(),
        idNumber,
        role: "voter",
      });

      await Log.create({ event: "USER_REGISTER", userId: user._id, metadata: { email } });

      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
      );

      return res.status(201).json({
        success: true,
        message: "Account created successfully",
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role, walletAddress: user.walletAddress },
      });
    } catch (err) {
      console.error("[Auth] Register error:", err);
      return res.status(500).json({ success: false, message: "Registration failed. Please try again." });
    }
  }
);

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post(
  "/login",
  [
    body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  validate,
  async (req, res) => {
    try {
      const { email, password } = req.body;

      // Fetch user including passwordHash (excluded by default)
      const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
      if (!user) {
        // Generic message to prevent email enumeration
        await Log.create({ event: "AUTH_FAILURE", metadata: { email, reason: "user_not_found" } });
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }

      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch) {
        await Log.create({ event: "AUTH_FAILURE", userId: user._id, metadata: { reason: "wrong_password" } });
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      await Log.create({ event: "USER_LOGIN", userId: user._id, metadata: { email } });

      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
      );

      return res.json({
        success: true,
        message: "Login successful",
        token,
        user: { id: user._id, name: user.name, email: user.email, role: user.role, walletAddress: user.walletAddress, isApproved: user.isApproved, hasVoted: user.hasVoted },
      });
    } catch (err) {
      console.error("[Auth] Login error:", err);
      return res.status(500).json({ success: false, message: "Login failed. Please try again." });
    }
  }
);

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get("/me", authenticate, async (req, res) => {
  return res.json({ success: true, user: req.user });
});

module.exports = router;
