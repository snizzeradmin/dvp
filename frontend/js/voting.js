/**
 * voting.js — Vote casting logic
 * Loads candidates, renders cards, manages confirmation flow,
 * and calls the smart contract via window.ethereum (MetaMask).
 */
import { api, showToast, sanitize, getStoredUser, isSimulationMode } from './api.js';
import { verifyWalletOwnership, getConnectedAddress, formatAddress } from './wallet.js';

// ── Contract ABI (loaded from file written by deploy.js) ─────────────────────

let _contractConfig = null;

async function loadContractConfig() {
  if (isSimulationMode) {
    return { address: '0x8F3Cf7ad23Cd31aC96A2EC74B2001A13a9927971', abi: [] };
  }
  if (_contractConfig) return _contractConfig;
  try {
    const res = await fetch('/frontend/js/contract/VotingContract.json');
    if (!res.ok) throw new Error('Contract config not found');
    _contractConfig = await res.json();
    return _contractConfig;
  } catch {
    throw new Error('Smart contract not deployed yet. Ask an admin to deploy the contract first.');
  }
}

// ── Web3 contract instance (using window.ethereum directly) ──────────────────

function getWeb3Contract(abi, address) {
  // We use window.ethereum directly to avoid loading Web3.js as a CDN dep.
  // The minimal interface we need: eth_sendTransaction → handled by MetaMask.
  // For calling (reading), we use eth_call.
  return { abi, address };
}

/**
 * Encode a function call using minimal ABI encoding.
 * Only handles simple uint256 argument (castVote).
 */
function encodeCastVote(candidateId) {
  // Function selector: keccak256("castVote(uint256)") first 4 bytes
  // = 0x72e89f34 (pre-computed)
  const selector = '0x72e89f34';
  const param = candidateId.toString(16).padStart(64, '0');
  return selector + param;
}

/**
 * Encode hasVoted(address) call.
 * Selector: keccak256("hasVoted(address)") first 4 bytes = 0x09f54818
 */
function encodeHasVoted(address) {
  const selector = '0x09f54818';
  const param = address.replace('0x', '').padStart(64, '0');
  return selector + param;
}

// ── Candidate loading ─────────────────────────────────────────────────────────

/**
 * Fetch the active election and its candidates from the backend.
 */
export async function loadActiveElection() {
  const data = await api.get('/api/elections/active');
  return data;
}

/**
 * Fetch candidates for a given election ID.
 */
export async function loadCandidates(electionId) {
  const data = await api.get(`/api/candidates?electionId=${electionId}`);
  return data.candidates;
}

// ── Candidate card rendering ──────────────────────────────────────────────────

/**
 * Render candidate cards into a container element.
 * @param {HTMLElement} container
 * @param {Array} candidates
 * @param {Function} onSelect - callback with candidate object
 */
export function renderCandidateCards(container, candidates, onSelect) {
  container.innerHTML = '';
  container.className = 'candidate-grid';

  candidates.forEach((candidate) => {
    const card = document.createElement('div');
    card.className = 'candidate-card';
    card.dataset.id = candidate._id;
    card.dataset.blockchainId = candidate.blockchainId;

    const imageContent = candidate.imageUrl
      ? `<img class="candidate-card__image" src="${sanitize(candidate.imageUrl)}" alt="${sanitize(candidate.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">`
        + `<div class="candidate-card__image-placeholder" style="display:none">👤</div>`
      : `<div class="candidate-card__image-placeholder">👤</div>`;

    card.innerHTML = `
      ${imageContent}
      <div class="candidate-card__body">
        <div class="candidate-card__name">${sanitize(candidate.name)}</div>
        <div class="candidate-card__party">🏛 ${sanitize(candidate.party)}</div>
        <p class="candidate-card__bio">${sanitize(candidate.bio || 'No biography provided.')}</p>
      </div>
    `;

    card.addEventListener('click', () => {
      // Deselect all
      container.querySelectorAll('.candidate-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      if (onSelect) onSelect(candidate);
    });

    card.style.animationDelay = `${candidates.indexOf(candidate) * 0.08}s`;
    card.style.animation = 'fadeInUp 0.5s ease both';

    container.appendChild(card);
  });
}

// ── Vote casting flow ─────────────────────────────────────────────────────────

/**
 * Main vote casting function.
 * 1. Verify wallet ownership
 * 2. Check chain has the contract
 * 3. Send castVote transaction via MetaMask
 * 4. Wait for confirmation
 * 5. Notify backend to record vote in DB
 *
 * @param {object} candidate - { _id, blockchainId, name, party }
 * @param {string} electionId
 * @param {object} callbacks - { onLoading, onSuccess, onError }
 */
export async function castVote(candidate, electionId, { onLoading, onSuccess, onError } = {}) {
  try {
    // ── Security: verify wallet matches account ──────────────────────────────
    const connectedAddress = getConnectedAddress();
    const { verified, reason } = verifyWalletOwnership(connectedAddress);
    if (!verified) {
      throw new Error(reason);
    }

    if (isSimulationMode) {
      if (onLoading) onLoading('Waiting for simulated wallet approval...');
      await new Promise((resolve) => setTimeout(resolve, 800));

      if (onLoading) onLoading('Transaction submitted. Waiting for blockchain confirmation...');
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Update mock database candidates
      const candidates = JSON.parse(localStorage.getItem('sim_candidates') || '[]');
      const candIndex = candidates.findIndex(c => c._id === candidate._id);
      if (candIndex !== -1) {
        candidates[candIndex].votes = (candidates[candIndex].votes || 0) + 1;
        localStorage.setItem('sim_candidates', JSON.stringify(candidates));
      }

      const txHash = '0x' + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
      
      // Notify backend to mark as voted
      await api.post('/api/blockchain/record-vote', { txHash, electionId });

      if (onSuccess) onSuccess(txHash);
      showToast('Your vote has been recorded on the blockchain!', 'success', 6000);
      return txHash;
    }

    // ── Load contract ────────────────────────────────────────────────────────
    const contractConfig = await loadContractConfig();
    if (!contractConfig.address) {
      throw new Error('Contract address not configured. Contact an administrator.');
    }

    if (onLoading) onLoading('Waiting for MetaMask approval...');

    // ── Send transaction via MetaMask ────────────────────────────────────────
    const data = encodeCastVote(candidate.blockchainId);

    let txHash;
    try {
      txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from:  connectedAddress,
          to:    contractConfig.address,
          data,
          gas:   '0x30D40', // 200,000 gas
        }],
      });
    } catch (err) {
      if (err.code === 4001) {
        throw new Error('Transaction was rejected in MetaMask. Your vote was not cast.');
      }
      throw new Error('MetaMask error: ' + err.message);
    }

    if (onLoading) onLoading('Transaction submitted. Waiting for blockchain confirmation...');

    // ── Wait for receipt ─────────────────────────────────────────────────────
    const receipt = await waitForReceipt(txHash);
    if (receipt.status !== '0x1') {
      throw new Error('Transaction failed on the blockchain. Your vote was reverted. You may have already voted or are not authorized.');
    }

    // ── Notify backend ───────────────────────────────────────────────────────
    try {
      await api.post('/api/blockchain/record-vote', { txHash, electionId });
    } catch (backendErr) {
      // Non-fatal: vote is on chain regardless
      console.warn('[Vote] Backend record failed:', backendErr.message);
    }

    if (onSuccess) onSuccess(txHash);
    showToast('Your vote has been recorded on the blockchain!', 'success', 6000);
    return txHash;

  } catch (err) {
    if (onError) onError(err.message);
    throw err;
  }
}

/**
 * Poll for a transaction receipt with timeout.
 * @param {string} txHash
 * @param {number} maxAttempts
 * @param {number} intervalMs
 */
async function waitForReceipt(txHash, maxAttempts = 60, intervalMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const receipt = await window.ethereum.request({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      });
      if (receipt) return receipt;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Transaction confirmation timed out. Please check the transaction hash on a block explorer.');
}

/**
 * Check from the blockchain (via MetaMask eth_call) whether a wallet has voted.
 * @param {string} walletAddress
 * @param {string} contractAddress
 * @returns {boolean}
 */
export async function checkHasVoted(walletAddress, contractAddress) {
  if (isSimulationMode) {
    const users = JSON.parse(localStorage.getItem('sim_users') || '[]');
    const user = users.find(u => u.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    return user ? user.hasVoted : false;
  }
  if (!window.ethereum) return false;
  try {
    const data = encodeHasVoted(walletAddress);
    const result = await window.ethereum.request({
      method: 'eth_call',
      params: [{ to: contractAddress, data }, 'latest'],
    });
    // Result is a 32-byte hex; non-zero = true
    return result !== '0x' + '0'.repeat(64);
  } catch { return false; }
}
