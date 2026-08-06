const { ethers } = require("hardhat");
const path = require("path");
const fs   = require("fs");

/**
 * Deploy VotingContract with optional candidate override.
 * After deployment, writes the ABI and address to:
 *   ../frontend/js/contract/VotingContract.json
 * so the frontend can import them without a build step.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // ── Candidate data ──────────────────────────────────────────────────────
  // These are overridden by the seed script when deploying from backend.
  // For manual deploys, sensible defaults are provided.
  const candidateNames  = process.env.CANDIDATE_NAMES
    ? JSON.parse(process.env.CANDIDATE_NAMES)
    : ["Alex Rivera", "Jordan Chen", "Morgan Taylor", "Sam Williams"];

  const candidateParties = process.env.CANDIDATE_PARTIES
    ? JSON.parse(process.env.CANDIDATE_PARTIES)
    : ["Progressive Alliance", "National Unity", "Green Future", "Liberty First"];

  const electionTitle = process.env.ELECTION_TITLE || "General Election 2026";

  console.log(`Election: "${electionTitle}"`);
  console.log(`Candidates (${candidateNames.length}):`, candidateNames);

  // ── Deploy ───────────────────────────────────────────────────────────────
  const VotingContract = await ethers.getContractFactory("VotingContract");
  const contract = await VotingContract.deploy(electionTitle, candidateNames, candidateParties);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("VotingContract deployed to:", contractAddress);

  // ── Extract ABI ──────────────────────────────────────────────────────────
  const artifact = await artifacts.readArtifact("VotingContract");

  // ── Write to frontend ────────────────────────────────────────────────────
  const outDir = path.join(__dirname, "../../frontend/js/contract");
  fs.mkdirSync(outDir, { recursive: true });

  const contractInfo = {
    address: contractAddress,
    abi: artifact.abi,
    network: hre.network.name,
    deployedAt: new Date().toISOString(),
    electionTitle,
  };

  const outPath = path.join(outDir, "VotingContract.json");
  fs.writeFileSync(outPath, JSON.stringify(contractInfo, null, 2));
  console.log("Contract info written to:", outPath);

  // ── Also write to backend config for web3Service ─────────────────────────
  const backendDir = path.join(__dirname, "../../backend/config");
  fs.mkdirSync(backendDir, { recursive: true });
  const backendPath = path.join(backendDir, "contract.json");
  fs.writeFileSync(backendPath, JSON.stringify(contractInfo, null, 2));
  console.log("Contract info written to:", backendPath);

  return contractAddress;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
