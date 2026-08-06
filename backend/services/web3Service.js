const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

let _provider = null;
let _signer = null;
let _contractInstance = null;

/**
 * Load the deployed contract info (address + ABI) from config/contract.json.
 * Falls back to CONTRACT_ADDRESS env var if provided.
 */
function loadContractConfig() {
  const configPath = path.join(__dirname, "../config/contract.json");
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
  // Fallback: minimal config from env vars only
  const address = process.env.CONTRACT_ADDRESS;
  if (!address) return null;
  // Load ABI from compiled artifact if available
  const artifactPath = path.join(
    __dirname,
    "../../contracts/artifacts/contracts/VotingContract.sol/VotingContract.json"
  );
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    return { address, abi: artifact.abi };
  }
  return null;
}

/**
 * Get (or lazily initialize) the ethers provider.
 */
function getProvider() {
  if (!_provider) {
    const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545";
    _provider = new ethers.JsonRpcProvider(rpcUrl);
  }
  return _provider;
}

/**
 * Get (or lazily initialize) the owner signer (used for admin on-chain calls).
 */
function getSigner() {
  if (!_signer) {
    const pk = process.env.DEPLOYER_PRIVATE_KEY;
    if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY is not set");
    _signer = new ethers.Wallet(pk, getProvider());
  }
  return _signer;
}

/**
 * Get a connected contract instance.
 * @param {boolean} withSigner - true for write calls (owner), false for read-only
 */
function getContract(withSigner = false) {
  if (_contractInstance && !withSigner) return _contractInstance;

  const config = loadContractConfig();
  if (!config || !config.address || !config.abi) {
    throw new Error(
      "Contract not deployed yet. Run the deploy script and ensure config/contract.json exists."
    );
  }

  const runner = withSigner ? getSigner() : getProvider();
  const instance = new ethers.Contract(config.address, config.abi, runner);
  if (!withSigner) _contractInstance = instance;
  return instance;
}

/**
 * Invalidate cached contract instance (call after redeployment).
 */
function resetContractCache() {
  _contractInstance = null;
  _provider = null;
  _signer = null;
}

// ── Public service methods ────────────────────────────────────────────────────

/**
 * Authorize a voter wallet on the smart contract.
 * @param {string} walletAddress - checksummed or lowercase Ethereum address
 */
async function authorizeVoter(walletAddress) {
  const contract = getContract(true); // needs signer (owner)
  const checksummed = ethers.getAddress(walletAddress);
  const tx = await contract.authorizeVoter(checksummed);
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

/**
 * Authorize multiple voters in a single transaction.
 */
async function authorizeVotersBatch(walletAddresses) {
  const contract = getContract(true);
  const checksummed = walletAddresses.map((a) => ethers.getAddress(a));
  const tx = await contract.authorizeVotersBatch(checksummed);
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

/**
 * Open voting on the smart contract.
 */
async function openVoting() {
  const contract = getContract(true);
  const tx = await contract.openVoting();
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

/**
 * Close voting on the smart contract.
 */
async function closeVoting() {
  const contract = getContract(true);
  const tx = await contract.closeVoting();
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

/**
 * Check whether a wallet has voted (read from chain).
 * @param {string} walletAddress
 * @returns {boolean}
 */
async function hasVoted(walletAddress) {
  const contract = getContract(false);
  const checksummed = ethers.getAddress(walletAddress);
  return contract.hasVoted(checksummed);
}

/**
 * Check whether a wallet is authorized to vote.
 * @param {string} walletAddress
 * @returns {boolean}
 */
async function isAuthorized(walletAddress) {
  const contract = getContract(false);
  const checksummed = ethers.getAddress(walletAddress);
  return contract.isAuthorized(checksummed);
}

/**
 * Fetch election results directly from the smart contract.
 * @returns {{ names: string[], parties: string[], votes: number[] }}
 */
async function getResults() {
  const contract = getContract(false);
  const [names, parties, votes] = await contract.getResults();
  return {
    names: [...names],
    parties: [...parties],
    votes: votes.map((v) => Number(v)),
  };
}

/**
 * Verify a transaction hash exists on-chain and return its details.
 * @param {string} txHash
 */
async function verifyTransaction(txHash) {
  const provider = getProvider();
  const tx = await provider.getTransaction(txHash);
  if (!tx) return null;
  const receipt = await provider.getTransactionReceipt(txHash);
  return {
    found: true,
    txHash,
    blockNumber: receipt?.blockNumber ?? null,
    status: receipt?.status === 1 ? "success" : "failed",
    from: tx.from,
  };
}

/**
 * Get the RPC provider's current block number (health check).
 */
async function getBlockNumber() {
  return getProvider().getBlockNumber();
}

module.exports = {
  authorizeVoter,
  authorizeVotersBatch,
  openVoting,
  closeVoting,
  hasVoted,
  isAuthorized,
  getResults,
  verifyTransaction,
  getBlockNumber,
  resetContractCache,
  loadContractConfig,
};
