const express = require("express");
const router  = express.Router();
const { param, body } = require("express-validator");

const Election    = require("../models/Election");
const User        = require("../models/User");
const Log         = require("../models/Log");
const authenticate   = require("../middleware/authenticate");
const validate       = require("../middleware/validate");
const web3Service    = require("../services/web3Service");

// ── GET /api/blockchain/status ────────────────────────────────────────────────
// Public: check blockchain connectivity
router.get("/status", async (req, res) => {
  try {
    const blockNumber = await web3Service.getBlockNumber();
    const contractConfig = web3Service.loadContractConfig();
    return res.json({
      success: true,
      connected: true,
      blockNumber,
      contractAddress: contractConfig?.address || null,
      network: contractConfig?.network || null,
    });
  } catch (err) {
    return res.json({
      success: true,
      connected: false,
      error: err.message,
    });
  }
});

// ── GET /api/blockchain/results/:electionId ───────────────────────────────────
// Public: read election results directly from the smart contract
router.get(
  "/results/:electionId",
  [param("electionId").isMongoId().withMessage("Invalid electionId")],
  validate,
  async (req, res) => {
    try {
      const election = await Election.findById(req.params.electionId);
      if (!election) return res.status(404).json({ success: false, message: "Election not found" });

      // Results are readable regardless of election status
      const results = await web3Service.getResults();
      return res.json({ success: true, election: { id: election._id, title: election.title, status: election.status }, results });
    } catch (err) {
      console.error("[Blockchain] Results error:", err);
      return res.status(500).json({ success: false, message: `Failed to fetch results: ${err.message}` });
    }
  }
);

// ── GET /api/blockchain/voted/:walletAddress ──────────────────────────────────
// Authenticated: check whether a specific wallet has voted (from chain, not DB)
router.get(
  "/voted/:walletAddress",
  authenticate,
  [
    param("walletAddress")
      .matches(/^0x[a-fA-F0-9]{40}$/)
      .withMessage("Invalid wallet address"),
  ],
  validate,
  async (req, res) => {
    try {
      // Only allow users to query their own wallet, or admin to query any
      if (
        req.user.role !== "admin" &&
        req.user.walletAddress !== req.params.walletAddress.toLowerCase()
      ) {
        return res.status(403).json({ success: false, message: "Cannot query another voter's status" });
      }

      const voted = await web3Service.hasVoted(req.params.walletAddress);
      const authorized = await web3Service.isAuthorized(req.params.walletAddress);
      return res.json({ success: true, walletAddress: req.params.walletAddress, voted, authorized });
    } catch (err) {
      console.error("[Blockchain] Voted check error:", err);
      return res.status(500).json({ success: false, message: `Blockchain check failed: ${err.message}` });
    }
  }
);

// ── POST /api/blockchain/verify-tx ───────────────────────────────────────────
// Authenticated: verify a transaction hash on the blockchain
router.post(
  "/verify-tx",
  authenticate,
  [body("txHash").matches(/^0x[a-fA-F0-9]{64}$/).withMessage("Invalid transaction hash format")],
  validate,
  async (req, res) => {
    try {
      const result = await web3Service.verifyTransaction(req.body.txHash);
      if (!result) {
        return res.status(404).json({ success: false, message: "Transaction not found on blockchain" });
      }

      await Log.create({
        event: "VOTE_VERIFIED",
        userId: req.user._id,
        metadata: { txHash: req.body.txHash, ...result },
      });

      return res.json({ success: true, transaction: result });
    } catch (err) {
      console.error("[Blockchain] Verify tx error:", err);
      return res.status(500).json({ success: false, message: `Verification failed: ${err.message}` });
    }
  }
);

// ── POST /api/blockchain/record-vote ─────────────────────────────────────────
// Authenticated: called by frontend after MetaMask confirms a vote transaction.
// Backend marks the user as voted in DB (for UI state only; source of truth is chain).
router.post(
  "/record-vote",
  authenticate,
  [
    body("txHash").matches(/^0x[a-fA-F0-9]{64}$/).withMessage("Invalid transaction hash"),
    body("electionId").isMongoId().withMessage("Valid electionId required"),
  ],
  validate,
  async (req, res) => {
    try {
      const { txHash, electionId } = req.body;

      // Trust the chain — verify tx exists and succeeded
      const txResult = await web3Service.verifyTransaction(txHash);
      if (!txResult || txResult.status !== "success") {
        return res.status(400).json({ success: false, message: "Transaction not confirmed on blockchain" });
      }

      // Verify from chain that this voter actually voted
      const voted = await web3Service.hasVoted(req.user.walletAddress);
      if (!voted) {
        return res.status(400).json({ success: false, message: "Vote not confirmed on blockchain" });
      }

      // Mark as voted in DB (idempotent)
      await User.findByIdAndUpdate(req.user._id, { hasVoted: true });

      await Log.create({
        event: "VOTE_SUBMITTED",
        userId: req.user._id,
        metadata: { txHash, electionId, walletAddress: req.user.walletAddress },
      });

      return res.json({ success: true, message: "Vote recorded", txHash });
    } catch (err) {
      console.error("[Blockchain] Record vote error:", err);
      return res.status(500).json({ success: false, message: `Failed to record vote: ${err.message}` });
    }
  }
);

module.exports = router;
