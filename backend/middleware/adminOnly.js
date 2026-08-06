/**
 * Middleware: restrict access to admin users only.
 * Must be used AFTER the authenticate middleware.
 */
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Forbidden: administrator access required",
    });
  }
  next();
}

module.exports = adminOnly;
