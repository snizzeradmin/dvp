const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Middleware: verify JWT in Authorization: Bearer header.
 * Attaches req.user on success.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ success: false, message: "Authentication token missing" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
      }
      return res.status(401).json({ success: false, message: "Invalid authentication token" });
    }

    const user = await User.findById(decoded.userId).select("-passwordHash");
    if (!user) {
      return res.status(401).json({ success: false, message: "User account not found" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("[Auth] Middleware error:", err);
    return res.status(500).json({ success: false, message: "Internal authentication error" });
  }
}

module.exports = authenticate;
