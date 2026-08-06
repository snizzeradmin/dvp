/**
 * Seed script: populate the database with an admin account, a demo election,
 * and 4 sample candidates.
 *
 * Usage: node scripts/seed.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const path     = require("path");
const fs       = require("fs");

// Models
const User      = require("../models/User");
const Election  = require("../models/Election");
const Candidate = require("../models/Candidate");
const Log       = require("../models/Log");

const DEMO_CANDIDATES = [
  {
    name:     "Alex Rivera",
    party:    "Progressive Alliance",
    bio:      "Champion of renewable energy and universal healthcare. Former environmental attorney with 15 years of public service experience.",
    imageUrl: "https://api.dicebear.com/8.x/personas/svg?seed=alex",
  },
  {
    name:     "Jordan Chen",
    party:    "National Unity",
    bio:      "Focused on economic growth and infrastructure investment. Former city mayor with a proven record of bipartisan collaboration.",
    imageUrl: "https://api.dicebear.com/8.x/personas/svg?seed=jordan",
  },
  {
    name:     "Morgan Taylor",
    party:    "Green Future",
    bio:      "Leading advocate for climate action, sustainable agriculture, and clean transportation. Grassroots organizer for over a decade.",
    imageUrl: "https://api.dicebear.com/8.x/personas/svg?seed=morgan",
  },
  {
    name:     "Sam Williams",
    party:    "Liberty First",
    bio:      "Proponent of fiscal responsibility, individual rights, and limited government. Successful entrepreneur and community leader.",
    imageUrl: "https://api.dicebear.com/8.x/personas/svg?seed=sam",
  },
];

async function seed() {
  console.log("[Seed] Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("[Seed] Connected.");

  // ── Admin account ──────────────────────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL || "admin@dvp.gov";
  let admin = await User.findOne({ email: adminEmail });

  if (!admin) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "Admin@SecureVoting2026!", 12);
    admin = await User.create({
      name:          process.env.ADMIN_NAME || "System Administrator",
      email:         adminEmail,
      passwordHash,
      walletAddress: "0x0000000000000000000000000000000000000001", // placeholder
      idNumber:      "ADMIN-001",
      role:          "admin",
      isApproved:    true,
    });
    console.log(`[Seed] Admin created: ${adminEmail}`);
  } else {
    console.log(`[Seed] Admin already exists: ${adminEmail}`);
  }

  // ── Demo election ──────────────────────────────────────────────────────────
  let election = await Election.findOne({ title: "General Election 2026" });

  if (!election) {
    election = await Election.create({
      title:       "General Election 2026",
      description: "The 2026 General Election determines representation for the next four-year term. All registered voters with approved wallets may participate.",
      status:      "draft",
      createdBy:   admin._id,
    });
    console.log("[Seed] Demo election created.");
  } else {
    console.log("[Seed] Demo election already exists.");
  }

  // ── Candidates ─────────────────────────────────────────────────────────────
  const existing = await Candidate.countDocuments({ electionId: election._id });
  if (existing === 0) {
    for (let i = 0; i < DEMO_CANDIDATES.length; i++) {
      await Candidate.create({
        ...DEMO_CANDIDATES[i],
        electionId:   election._id,
        blockchainId: i,
      });
    }
    console.log(`[Seed] ${DEMO_CANDIDATES.length} candidates created.`);
  } else {
    console.log(`[Seed] Candidates already exist (${existing} found).`);
  }

  console.log("\n[Seed] ✓ Done.");
  console.log(`  Admin email:    ${adminEmail}`);
  console.log(`  Admin password: ${process.env.ADMIN_PASSWORD || "Admin@SecureVoting2026!"}`);
  console.log(`  Election:       General Election 2026 (${election.status})`);
  console.log(`  Candidates:     ${DEMO_CANDIDATES.map((c) => c.name).join(", ")}`);
  console.log("\n  Next steps:");
  console.log("  1. cd ../contracts && npm install && npx hardhat node");
  console.log("  2. npx hardhat run scripts/deploy.js --network localhost");
  console.log("  3. cd ../backend && node server.js");
  console.log("  4. Open http://localhost:3001 in your browser");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("[Seed] Error:", err);
  process.exit(1);
});
