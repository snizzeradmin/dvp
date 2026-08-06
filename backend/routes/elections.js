const express  = require("express");
const router   = express.Router();
const { body, param } = require("express-validator");

const Election  = require("../models/Election");
const Candidate = require("../models/Candidate");
const Log       = require("../models/Log");
const authenticate = require("../middleware/authenticate");
const adminOnly    = require("../middleware/adminOnly");
const validate     = require("../middleware/validate");
const web3Service  = require("../services/web3Service");

// ── GET /api/elections/active ─────────────────────────────────────────────────
// Public: returns the currently active election
router.get("/active", async (req, res) => {
  try {
    const election = await Election.findOne({ status: "active" });
    if (!election) {
      return res.json({ success: true, election: null, message: "No active election" });
    }
    const candidates = await Candidate.find({ electionId: election._id });
    return res.json({ success: true, election, candidates });
  } catch (err) {
    console.error("[Elections] Active error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch active election" });
  }
});

// ── GET /api/elections ────────────────────────────────────────────────────────
// Admin: list all elections
router.get("/", authenticate, adminOnly, async (req, res) => {
  try {
    const elections = await Election.find().sort({ createdAt: -1 });
    return res.json({ success: true, elections });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to fetch elections" });
  }
});

// ── POST /api/elections ───────────────────────────────────────────────────────
// Admin: create a new election (draft)
router.post(
  "/",
  authenticate,
  adminOnly,
  [
    body("title").trim().notEmpty().withMessage("Election title is required")
      .isLength({ max: 200 }).withMessage("Title too long"),
    body("description").optional().trim().isLength({ max: 2000 }),
    body("startDate").optional().isISO8601().toDate(),
    body("endDate").optional().isISO8601().toDate(),
  ],
  validate,
  async (req, res) => {
    try {
      const { title, description, startDate, endDate } = req.body;
      const election = await Election.create({
        title,
        description,
        startDate,
        endDate,
        status: "draft",
        createdBy: req.user._id,
      });
      await Log.create({ event: "ELECTION_CREATED", userId: req.user._id, metadata: { title } });
      return res.status(201).json({ success: true, election });
    } catch (err) {
      console.error("[Elections] Create error:", err);
      return res.status(500).json({ success: false, message: "Failed to create election" });
    }
  }
);

// ── PUT /api/elections/:id ────────────────────────────────────────────────────
// Admin: edit an election (only if draft)
router.put(
  "/:id",
  authenticate,
  adminOnly,
  [
    param("id").isMongoId().withMessage("Invalid election ID"),
    body("title").optional().trim().notEmpty().isLength({ max: 200 }),
    body("description").optional().trim().isLength({ max: 2000 }),
    body("startDate").optional().isISO8601().toDate(),
    body("endDate").optional().isISO8601().toDate(),
  ],
  validate,
  async (req, res) => {
    try {
      const election = await Election.findById(req.params.id);
      if (!election) return res.status(404).json({ success: false, message: "Election not found" });
      if (election.status !== "draft") {
        return res.status(400).json({ success: false, message: "Only draft elections can be edited" });
      }
      Object.assign(election, req.body);
      await election.save();
      return res.json({ success: true, election });
    } catch (err) {
      return res.status(500).json({ success: false, message: "Failed to update election" });
    }
  }
);

// ── DELETE /api/elections/:id ─────────────────────────────────────────────────
// Admin: delete a draft election
router.delete("/:id", authenticate, adminOnly, [
  param("id").isMongoId(),
], validate, async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: "Election not found" });
    if (election.status !== "draft") {
      return res.status(400).json({ success: false, message: "Only draft elections can be deleted" });
    }
    await Candidate.deleteMany({ electionId: election._id });
    await election.deleteOne();
    await Log.create({ event: "ELECTION_DELETED", userId: req.user._id, metadata: { electionId: req.params.id } });
    return res.json({ success: true, message: "Election deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to delete election" });
  }
});

// ── POST /api/elections/:id/start ─────────────────────────────────────────────
// Admin: deploy contract + open voting
router.post("/:id/start", authenticate, adminOnly, [
  param("id").isMongoId(),
], validate, async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: "Election not found" });
    if (election.status !== "draft") {
      return res.status(400).json({ success: false, message: "Election is not in draft status" });
    }

    // Ensure there is an active contract available
    const contractConfig = web3Service.loadContractConfig();
    if (!contractConfig || !contractConfig.address) {
      return res.status(400).json({
        success: false,
        message: "No smart contract deployed. Run the deploy script first.",
      });
    }

    // Open voting on the blockchain
    const { txHash } = await web3Service.openVoting();

    election.status = "active";
    election.startDate = election.startDate || new Date();
    election.contractAddress = contractConfig.address;
    await election.save();

    await Log.create({
      event: "ELECTION_STARTED",
      userId: req.user._id,
      metadata: { electionId: election._id, txHash },
    });

    return res.json({ success: true, message: "Election started", election, txHash });
  } catch (err) {
    console.error("[Elections] Start error:", err);
    return res.status(500).json({ success: false, message: `Failed to start election: ${err.message}` });
  }
});

// ── POST /api/elections/:id/end ───────────────────────────────────────────────
// Admin: close voting on blockchain and mark election ended
router.post("/:id/end", authenticate, adminOnly, [
  param("id").isMongoId(),
], validate, async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ success: false, message: "Election not found" });
    if (election.status !== "active") {
      return res.status(400).json({ success: false, message: "Election is not currently active" });
    }

    const { txHash } = await web3Service.closeVoting();

    election.status = "ended";
    election.endDate = new Date();
    await election.save();

    await Log.create({
      event: "ELECTION_ENDED",
      userId: req.user._id,
      metadata: { electionId: election._id, txHash },
    });

    return res.json({ success: true, message: "Election ended", election, txHash });
  } catch (err) {
    console.error("[Elections] End error:", err);
    return res.status(500).json({ success: false, message: `Failed to end election: ${err.message}` });
  }
});

module.exports = router;
