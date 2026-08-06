const express = require("express");
const router  = express.Router();
const { body } = require("express-validator");

const User        = require("../models/User");
const Log         = require("../models/Log");
const authenticate   = require("../middleware/authenticate");
const adminOnly      = require("../middleware/adminOnly");
const validate       = require("../middleware/validate");
const web3Service    = require("../services/web3Service");

// ── GET /api/voters ───────────────────────────────────────────────────────────
// Admin: list all registered voter accounts
router.get("/", authenticate, adminOnly, async (req, res) => {
  try {
    const voters = await User.find({ role: "voter" }).sort({ createdAt: -1 });
    return res.json({ success: true, voters });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to fetch voters" });
  }
});

// ── POST /api/voters/approve ──────────────────────────────────────────────────
// Admin: authorize a voter on the blockchain and mark them approved in DB
router.post(
  "/approve",
  authenticate,
  adminOnly,
  [
    body("userId").isMongoId().withMessage("Valid userId required"),
  ],
  validate,
  async (req, res) => {
    try {
      const voter = await User.findById(req.body.userId);
      if (!voter) return res.status(404).json({ success: false, message: "Voter not found" });
      if (voter.role !== "voter") {
        return res.status(400).json({ success: false, message: "Target account is not a voter" });
      }
      if (voter.isApproved) {
        return res.status(400).json({ success: false, message: "Voter is already approved" });
      }

      // Authorize on-chain
      const { txHash } = await web3Service.authorizeVoter(voter.walletAddress);

      // Mark approved in DB
      voter.isApproved = true;
      await voter.save();

      await Log.create({
        event: "VOTER_APPROVED",
        userId: req.user._id,
        metadata: { voterId: voter._id, walletAddress: voter.walletAddress, txHash },
      });

      return res.json({ success: true, message: "Voter approved on blockchain", txHash });
    } catch (err) {
      console.error("[Voters] Approve error:", err);
      return res.status(500).json({ success: false, message: `Failed to approve voter: ${err.message}` });
    }
  }
);

// ── POST /api/voters/approve-batch ────────────────────────────────────────────
// Admin: batch approve multiple voters
router.post(
  "/approve-batch",
  authenticate,
  adminOnly,
  [
    body("userIds").isArray({ min: 1 }).withMessage("userIds must be a non-empty array"),
    body("userIds.*").isMongoId().withMessage("Each userId must be a valid Mongo ID"),
  ],
  validate,
  async (req, res) => {
    try {
      const voters = await User.find({ _id: { $in: req.body.userIds }, role: "voter", isApproved: false });
      if (voters.length === 0) {
        return res.status(400).json({ success: false, message: "No eligible voters found" });
      }

      const addresses = voters.map((v) => v.walletAddress);
      const { txHash } = await web3Service.authorizeVotersBatch(addresses);

      await User.updateMany({ _id: { $in: voters.map((v) => v._id) } }, { isApproved: true });

      await Log.create({
        event: "VOTER_APPROVED",
        userId: req.user._id,
        metadata: { count: voters.length, txHash },
      });

      return res.json({ success: true, message: `${voters.length} voter(s) approved`, txHash });
    } catch (err) {
      console.error("[Voters] Batch approve error:", err);
      return res.status(500).json({ success: false, message: `Batch approval failed: ${err.message}` });
    }
  }
);

// ── GET /api/voters/logs ──────────────────────────────────────────────────────
// Admin: fetch audit logs
router.get("/logs", authenticate, adminOnly, async (req, res) => {
  try {
    const logs = await Log.find().sort({ createdAt: -1 }).limit(100);
    return res.json({ success: true, logs });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to fetch logs" });
  }
});

module.exports = router;
