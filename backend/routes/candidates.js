const express = require("express");
const router  = express.Router();
const { body, query, param } = require("express-validator");

const Candidate = require("../models/Candidate");
const Election  = require("../models/Election");
const Log       = require("../models/Log");
const authenticate = require("../middleware/authenticate");
const adminOnly    = require("../middleware/adminOnly");
const validate     = require("../middleware/validate");

// ── GET /api/candidates?electionId=... ────────────────────────────────────────
// Public: list candidates for a given election
router.get(
  "/",
  [query("electionId").isMongoId().withMessage("Valid electionId required")],
  validate,
  async (req, res) => {
    try {
      const candidates = await Candidate.find({ electionId: req.query.electionId })
        .sort({ blockchainId: 1 });
      return res.json({ success: true, candidates });
    } catch (err) {
      return res.status(500).json({ success: false, message: "Failed to fetch candidates" });
    }
  }
);

// ── POST /api/candidates ──────────────────────────────────────────────────────
// Admin: add a candidate to a draft election
router.post(
  "/",
  authenticate,
  adminOnly,
  [
    body("electionId").isMongoId().withMessage("Valid electionId required"),
    body("name").trim().notEmpty().isLength({ max: 150 }).withMessage("Candidate name required"),
    body("party").trim().notEmpty().isLength({ max: 150 }).withMessage("Party name required"),
    body("bio").optional().trim().isLength({ max: 1000 }),
    body("imageUrl").optional().trim().isURL().withMessage("imageUrl must be a valid URL"),
  ],
  validate,
  async (req, res) => {
    try {
      const { electionId, name, party, bio, imageUrl } = req.body;

      const election = await Election.findById(electionId);
      if (!election) return res.status(404).json({ success: false, message: "Election not found" });
      if (election.status !== "draft") {
        return res.status(400).json({ success: false, message: "Cannot add candidates to a running election" });
      }

      // blockchainId = next sequential index in this election
      const count = await Candidate.countDocuments({ electionId });

      const candidate = await Candidate.create({
        name, party, bio, imageUrl, electionId, blockchainId: count,
      });

      await Log.create({
        event: "CANDIDATE_ADDED",
        userId: req.user._id,
        metadata: { candidateId: candidate._id, name, electionId },
      });

      return res.status(201).json({ success: true, candidate });
    } catch (err) {
      console.error("[Candidates] Create error:", err);
      return res.status(500).json({ success: false, message: "Failed to add candidate" });
    }
  }
);

// ── DELETE /api/candidates/:id ────────────────────────────────────────────────
// Admin: remove a candidate (draft elections only)
router.delete("/:id", authenticate, adminOnly, [
  param("id").isMongoId(),
], validate, async (req, res) => {
  try {
    const candidate = await Candidate.findById(req.params.id).populate("electionId");
    if (!candidate) return res.status(404).json({ success: false, message: "Candidate not found" });
    if (candidate.electionId.status !== "draft") {
      return res.status(400).json({ success: false, message: "Cannot remove candidates from a running election" });
    }
    await candidate.deleteOne();
    await Log.create({ event: "CANDIDATE_REMOVED", userId: req.user._id, metadata: { candidateId: req.params.id } });
    return res.json({ success: true, message: "Candidate removed" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to remove candidate" });
  }
});

module.exports = router;
