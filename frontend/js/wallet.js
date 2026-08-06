/**
 * wallet.js — MetaMask integration
 * Handles detection, connection, wallet verification, and state management.
 */
import { getStoredUser, showToast, isSimulationMode } from './api.js';

// ── State ─────────────────────────────────────────────────────────────────────

let _connectedAddress = null;
const listeners = [];

export function getConnectedAddress() { return _connectedAddress; }

export function onWalletChange(callback) {
  listeners.push(callback);
}

function notifyListeners(address) {
  listeners.forEach((fn) => fn(address));
}

// ── MetaMask detection ────────────────────────────────────────────────────────

/**
 * Returns true if MetaMask (or another EIP-1193 provider) is installed.
 */
export function isMetaMaskInstalled() {
  if (isSimulationMode) return true;
  return typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask;
}

/**
 * Returns true if any EIP-1193 provider is available (MetaMask or compatible).
 */
export function isWeb3Available() {
  if (isSimulationMode) return true;
  return typeof window.ethereum !== 'undefined';
}

// ── Connection ────────────────────────────────────────────────────────────────

/**
 * Request wallet connection.
 * Returns the connected address (lowercase) or throws.
 */
export async function connectWallet() {
  if (isSimulationMode) {
    const user = getStoredUser();
    _connectedAddress = user ? user.walletAddress.toLowerCase() : '0x71c7656ec7ab88b098defb751b7401b5f6d8976f';
    notifyListeners(_connectedAddress);
    return _connectedAddress;
  }

  if (!isWeb3Available()) {
    throw new Error(
      'MetaMask is not installed. Please install MetaMask from metamask.io to vote.'
    );
  }

  let accounts;
  try {
    accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  } catch (err) {
    if (err.code === 4001) {
      throw new Error('Wallet connection was rejected. Please approve the MetaMask request to continue.');
    }
    throw new Error('Failed to connect wallet: ' + err.message);
  }

  if (!accounts || accounts.length === 0) {
    throw new Error('No wallet accounts found. Please unlock MetaMask and try again.');
  }

  _connectedAddress = accounts[0].toLowerCase();
  notifyListeners(_connectedAddress);
  return _connectedAddress;
}

/**
 * Get currently connected accounts without triggering a popup.
 */
export async function getAccounts() {
  if (isSimulationMode) {
    return _connectedAddress ? [_connectedAddress] : [];
  }
  if (!isWeb3Available()) return [];
  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    return accounts.map((a) => a.toLowerCase());
  } catch {
    return [];
  }
}

/**
 * Restore connection from existing permissions (no popup).
 */
export async function restoreWalletConnection() {
  if (isSimulationMode) {
    const user = getStoredUser();
    if (user && user.walletAddress) {
      _connectedAddress = user.walletAddress.toLowerCase();
      notifyListeners(_connectedAddress);
      return _connectedAddress;
    }
    return null;
  }
  const accounts = await getAccounts();
  if (accounts.length > 0) {
    _connectedAddress = accounts[0];
    notifyListeners(_connectedAddress);
    return _connectedAddress;
  }
  return null;
}

// ── Wallet verification ───────────────────────────────────────────────────────

/**
 * Verify that the connected wallet matches the authenticated user's registered wallet.
 * This is the primary security gate before allowing votes.
 *
 * @param {string} [connectedAddress] - Override; defaults to _connectedAddress
 * @returns {{ verified: boolean, reason?: string }}
 */
export function verifyWalletOwnership(connectedAddress) {
  const address = (connectedAddress || _connectedAddress || '').toLowerCase();
  if (!address) {
    return { verified: false, reason: 'No wallet connected. Please connect MetaMask.' };
  }

  const user = getStoredUser();
  if (!user) {
    return { verified: false, reason: 'You must be logged in to verify wallet ownership.' };
  }

  const registeredAddress = (user.walletAddress || '').toLowerCase();
  if (!registeredAddress) {
    return { verified: false, reason: 'No wallet address found in your account.' };
  }

  if (address !== registeredAddress) {
    return {
      verified: false,
      reason: `Wallet mismatch. Your account is registered with ${formatAddress(registeredAddress)}, but you connected ${formatAddress(address)}. Please switch wallets in MetaMask.`,
    };
  }

  return { verified: true };
}

// ── Network helpers ───────────────────────────────────────────────────────────

/**
 * Get the current chain ID.
 */
export async function getChainId() {
  if (isSimulationMode) return 31337;
  if (!isWeb3Available()) return null;
  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    return parseInt(chainId, 16);
  } catch { return null; }
}

/**
 * Request network switch to Hardhat local (chainId 31337).
 */
export async function switchToHardhatNetwork() {
  if (isSimulationMode) return;
  if (!isWeb3Available()) return;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x7a69' }], // 31337 in hex
    });
  } catch (err) {
    // Chain not added — add it
    if (err.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x7a69',
          chainName: 'Hardhat Local',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['http://127.0.0.1:8545'],
        }],
      });
    }
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/**
 * Format an Ethereum address for display: 0x1234...abcd
 */
export function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ── Event listeners ───────────────────────────────────────────────────────────

/**
 * Set up listeners for MetaMask account and chain changes.
 * Call once on page load.
 */
export function setupWalletListeners({ onAccountsChanged, onChainChanged } = {}) {
  if (isSimulationMode) return;
  if (!isWeb3Available()) return;

  window.ethereum.on('accountsChanged', (accounts) => {
    _connectedAddress = accounts[0]?.toLowerCase() || null;
    notifyListeners(_connectedAddress);
    if (onAccountsChanged) onAccountsChanged(_connectedAddress);
  });

  window.ethereum.on('chainChanged', (chainId) => {
    if (onChainChanged) onChainChanged(parseInt(chainId, 16));
    // Chain change requires reload for safety
    window.location.reload();
  });
}

// ── UI helpers ────────────────────────────────────────────────────────────────

/**
 * Render wallet connection badge HTML.
 */
export function renderWalletBadge(address) {
  if (!address) {
    return `<span class="wallet-badge disconnected">⊗ Not Connected</span>`;
  }
  return `<span class="wallet-badge connected">◉ ${formatAddress(address)}</span>`;
}
