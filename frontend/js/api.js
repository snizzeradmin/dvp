/**
 * api.js — Centralized fetch wrapper
 * Injects Authorization header, handles 401 redirects, and provides
 * consistent error handling across all API calls.
 */

const BASE_URL = window.location.origin;

// Always use simulation mode — no backend or MetaMask required
export let isSimulationMode = true;
localStorage.setItem('simulate_mode', 'true');

/**
 * Sanitize a string to reduce XSS risk before inserting into the DOM.
 * @param {string} str
 * @returns {string}
 */
export function sanitize(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

/**
 * Get the stored JWT token.
 */
export function getToken() {
  return localStorage.getItem('aegis_token');
}

/**
 * Store a JWT token.
 */
export function setToken(token) {
  localStorage.setItem('aegis_token', token);
}

/**
 * Remove the stored JWT token (logout).
 */
export function clearToken() {
  localStorage.removeItem('aegis_token');
  localStorage.removeItem('aegis_user');
}

/**
 * Get stored user profile object.
 */
export function getStoredUser() {
  try {
    const raw = localStorage.getItem('aegis_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * Store user profile.
 */
export function setStoredUser(user) {
  localStorage.setItem('aegis_user', JSON.stringify(user));
}

/**
 * Build standard request headers.
 */
function buildHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// Mock DB configuration and initialization
const MOCK_DB = {
  active_election: {
    _id: "sim-election-123",
    title: "General Election 2026",
    description: "The 2026 General Election determines representation for the next four-year term. All registered voters with approved wallets may participate.",
    status: "active",
  },
  candidates: [
    {
      _id: "sim-cand-1",
      blockchainId: 0,
      name: "Alex Rivera",
      party: "Progressive Alliance",
      bio: "Champion of renewable energy and universal healthcare. Former environmental attorney with 15 years of public service experience.",
      imageUrl: "https://api.dicebear.com/8.x/personas/svg?seed=alex",
      votes: 45
    },
    {
      _id: "sim-cand-2",
      blockchainId: 1,
      name: "Jordan Chen",
      party: "National Unity",
      bio: "Focused on economic growth and infrastructure investment. Former city mayor with a proven record of collaboration.",
      imageUrl: "https://api.dicebear.com/8.x/personas/svg?seed=jordan",
      votes: 38
    },
    {
      _id: "sim-cand-3",
      blockchainId: 2,
      name: "Morgan Taylor",
      party: "Green Future",
      bio: "Leading advocate for climate action, sustainable agriculture, and clean transportation. Grassroots organizer for a decade.",
      imageUrl: "https://api.dicebear.com/8.x/personas/svg?seed=morgan",
      votes: 21
    },
    {
      _id: "sim-cand-4",
      blockchainId: 3,
      name: "Sam Williams",
      party: "Liberty First",
      bio: "Proponent of fiscal responsibility, individual rights, and limited government. Successful entrepreneur and leader.",
      imageUrl: "https://api.dicebear.com/8.x/personas/svg?seed=sam",
      votes: 12
    }
  ],
  users: [
    {
      _id: "sim-user-admin",
      name: "System Administrator",
      email: "admin@dvp.gov",
      passwordHash: "",
      role: "admin",
      walletAddress: "0x0000000000000000000000000000000000000001",
      idNumber: "ADMIN-001",
      isApproved: true,
      hasVoted: false
    },
    {
      _id: "sim-user-demo",
      name: "Alex Demo",
      email: "voter@dvp.gov",
      passwordHash: "",
      role: "voter",
      walletAddress: "0x71c7656ec7ab88b098defb751b7401b5f6d8976f",
      idNumber: "NIN-9876543210",
      isApproved: true,
      hasVoted: false
    }
  ],
  logs: [
    {
      _id: "log-1",
      event: "SYSTEM_START",
      metadata: { note: "Simulated voting platform initialized" },
      createdAt: new Date().toISOString()
    }
  ]
};

export function initMockDB() {
  if (!localStorage.getItem('sim_db_initialized')) {
    localStorage.setItem('sim_users', JSON.stringify(MOCK_DB.users));
    localStorage.setItem('sim_candidates', JSON.stringify(MOCK_DB.candidates));
    localStorage.setItem('sim_election', JSON.stringify(MOCK_DB.active_election));
    localStorage.setItem('sim_logs', JSON.stringify(MOCK_DB.logs));
    localStorage.setItem('sim_db_initialized', 'true');
  }
}

if (isSimulationMode) {
  initMockDB();
}

export async function handleSimulatedRequest(path, options) {
  await new Promise((resolve) => setTimeout(resolve, 300)); // Sim network latency

  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};

  const getUsers = () => JSON.parse(localStorage.getItem('sim_users') || '[]');
  const setUsers = (users) => localStorage.setItem('sim_users', JSON.stringify(users));

  const getCandidates = () => JSON.parse(localStorage.getItem('sim_candidates') || '[]');
  const setCandidates = (candidates) => localStorage.setItem('sim_candidates', JSON.stringify(candidates));

  const getLogs = () => JSON.parse(localStorage.getItem('sim_logs') || '[]');
  const addLog = (event, metadata = {}) => {
    const logs = getLogs();
    logs.unshift({
      _id: 'log-' + Date.now() + Math.random().toString(36).substr(2, 4),
      event,
      metadata,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem('sim_logs', JSON.stringify(logs));
  };

  // 1. POST /api/auth/register
  if (path === '/api/auth/register' && method === 'POST') {
    const { name, email, password, walletAddress, idNumber } = body;
    const users = getUsers();
    
    if (users.some(u => u.email === email.toLowerCase())) {
      throwSimErr(409, 'Email address already registered');
    }
    if (users.some(u => u.walletAddress === walletAddress.toLowerCase())) {
      throwSimErr(409, 'Wallet address already registered');
    }

    const newUser = {
      _id: 'sim-user-' + Date.now(),
      name,
      email: email.toLowerCase(),
      role: 'voter',
      walletAddress: walletAddress.toLowerCase(),
      idNumber,
      isApproved: false,
      hasVoted: false
    };

    users.push(newUser);
    setUsers(users);
    addLog('USER_REGISTER', { email: newUser.email, walletAddress: newUser.walletAddress });

    return {
      success: true,
      message: 'Account created successfully (Simulated)',
      token: 'mock-token-' + newUser._id,
      user: newUser
    };
  }

  // 2. POST /api/auth/login
  if (path === '/api/auth/login' && method === 'POST') {
    const { email, password } = body;
    const users = getUsers();

    if (email.toLowerCase() === 'admin@dvp.gov') {
      if (password !== 'Admin@SecureVoting2026!') {
        addLog('AUTH_FAILURE', { email, reason: 'wrong_password' });
        throwSimErr(401, 'Invalid email or password');
      }
      const adminUser = users.find(u => u.email === 'admin@dvp.gov');
      addLog('USER_LOGIN', { email: adminUser.email });
      return {
        success: true,
        message: 'Login successful (Simulated)',
        token: 'mock-token-' + adminUser._id,
        user: adminUser
      };
    }

    const user = users.find(u => u.email === email.toLowerCase());
    if (!user) {
      addLog('AUTH_FAILURE', { email, reason: 'user_not_found' });
      throwSimErr(401, 'Invalid email or password — account not found');
    }
    // In simulation mode, accept any non-empty password for registered users
    if (!password || password.trim() === '') {
      throwSimErr(401, 'Password is required');
    }

    addLog('USER_LOGIN', { email: user.email });
    return {
      success: true,
      message: 'Login successful (Simulated)',
      token: 'mock-token-' + user._id,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        walletAddress: user.walletAddress,
        isApproved: user.isApproved,
        hasVoted: user.hasVoted
      }
    };
  }

  // 3. GET /api/auth/me
  if (path === '/api/auth/me' && method === 'GET') {
    const token = getToken();
    if (!token || !token.startsWith('mock-token-')) {
      throwSimErr(401, 'Authentication required');
    }
    const userId = token.replace('mock-token-', '');
    const users = getUsers();
    const user = users.find(u => u._id === userId);
    if (!user) {
      throwSimErr(401, 'User session not found');
    }
    return {
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        walletAddress: user.walletAddress,
        isApproved: user.isApproved,
        hasVoted: user.hasVoted
      }
    };
  }

  // 4. GET /api/elections/active
  if (path === '/api/elections/active' && method === 'GET') {
    const election = JSON.parse(localStorage.getItem('sim_election'));
    return { success: true, election };
  }

  // 5. GET /api/candidates
  if (path.startsWith('/api/candidates') && method === 'GET') {
    const candidates = getCandidates();
    return { success: true, candidates };
  }

  // 6. POST /api/blockchain/record-vote
  if (path === '/api/blockchain/record-vote' && method === 'POST') {
    const token = getToken();
    if (!token) throwSimErr(401, 'Authentication required');
    const userId = token.replace('mock-token-', '');

    const users = getUsers();
    const userIndex = users.findIndex(u => u._id === userId);
    if (userIndex === -1) throwSimErr(404, 'User not found');
    
    if (users[userIndex].hasVoted) {
      throwSimErr(400, 'User has already voted');
    }

    users[userIndex].hasVoted = true;
    setUsers(users);

    const cachedUser = getStoredUser();
    if (cachedUser) {
      cachedUser.hasVoted = true;
      setStoredUser(cachedUser);
    }

    addLog('VOTE_RECORDED', { email: users[userIndex].email, walletAddress: users[userIndex].walletAddress });
    return { success: true };
  }

  // 7. GET /api/blockchain/results/
  if (path.startsWith('/api/blockchain/results/') && method === 'GET') {
    const election = JSON.parse(localStorage.getItem('sim_election'));
    const candidates = getCandidates();
    return {
      success: true,
      election,
      results: {
        names: candidates.map(c => c.name),
        parties: candidates.map(c => c.party),
        votes: candidates.map(c => c.votes || 0)
      }
    };
  }

  // 8. GET /api/blockchain/status
  if (path === '/api/blockchain/status' && method === 'GET') {
    return {
      success: true,
      connected: true,
      blockNumber: 1256789 + Math.floor(Math.random() * 12),
      contractAddress: "0x8F3Cf7ad23Cd31aC96A2EC74B2001A13a9927971"
    };
  }

  // 8b. GET /api/blockchain/voted/:address
  if (path.startsWith('/api/blockchain/voted/') && method === 'GET') {
    const address = path.split('/').pop().toLowerCase();
    const users = getUsers();
    const user = users.find(u => u.walletAddress && u.walletAddress.toLowerCase() === address);
    return { success: true, voted: user ? user.hasVoted : false };
  }

  // 9. GET /api/voters
  if (path === '/api/voters' && method === 'GET') {
    const voters = getUsers().filter(u => u.role === 'voter');
    return { success: true, voters };
  }

  // 10. POST /api/voters/approve
  if (path === '/api/voters/approve' && method === 'POST') {
    const { userId } = body;
    const users = getUsers();
    const userIndex = users.findIndex(u => u._id === userId);
    if (userIndex === -1) throwSimErr(404, 'Voter not found');

    users[userIndex].isApproved = true;
    setUsers(users);
    addLog('VOTER_APPROVED', { voterId: userId, walletAddress: users[userIndex].walletAddress });
    return { success: true, message: 'Voter approved on blockchain (Simulated)' };
  }

  // 11. POST /api/voters/approve-batch
  if (path === '/api/voters/approve-batch' && method === 'POST') {
    const { userIds } = body;
    const users = getUsers();
    
    let count = 0;
    userIds.forEach(id => {
      const idx = users.findIndex(u => u._id === id);
      if (idx !== -1 && !users[idx].isApproved) {
        users[idx].isApproved = true;
        count++;
      }
    });

    setUsers(users);
    addLog('VOTER_APPROVED', { count });
    return { success: true, message: `${count} voters approved (Simulated)` };
  }

  // 12. GET /api/voters/logs
  if (path === '/api/voters/logs' && method === 'GET') {
    const logs = getLogs();
    return { success: true, logs };
  }

  throwSimErr(404, `Route ${method} ${path} not found in simulated mode`);
}

function throwSimErr(status, message) {
  const err = new Error(message);
  err.status = status;
  err.errors = [];
  throw err;
}

/**
 * Core fetch wrapper.
 * @param {string} path - API path (e.g. '/api/auth/login')
 * @param {object} options - Fetch options
 * @returns {Promise<object>} - Parsed JSON response
 */
async function request(path, options = {}) {
  if (isSimulationMode) {
    return handleSimulatedRequest(path, options);
  }

  const url = `${BASE_URL}${path}`;
  const config = {
    ...options,
    headers: buildHeaders(options.headers),
  };

  let response;
  try {
    response = await fetch(url, config);
  } catch (err) {
    console.warn("Backend server not reachable. Switching to client-side simulated mode.");
    isSimulationMode = true;
    localStorage.setItem('simulate_mode', 'true');
    initMockDB();
    return handleSimulatedRequest(path, options);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Server returned an invalid response (HTTP ${response.status})`);
  }

  // Auto-logout on 401
  if (response.status === 401) {
    clearToken();
    if (!window.location.pathname.includes('login') && !window.location.pathname.endsWith('voting.html')) {
      window.location.href = '/frontend/pages/login.html';
    }
    throw new Error(data.message || 'Authentication required');
  }

  if (!response.ok) {
    const msg = data.message || `Request failed (HTTP ${response.status})`;
    const err = new Error(msg);
    err.errors = data.errors || [];
    err.status = response.status;
    throw err;
  }

  return data;
}

// ── Convenience methods ───────────────────────────────────────────────────────

export const api = {
  get:    (path) => request(path, { method: 'GET' }),
  post:   (path, body) => request(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (path, body) => request(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: (path)       => request(path, { method: 'DELETE' }),
};

// ── Toast notification system ─────────────────────────────────────────────────

let toastContainer = null;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration - ms before auto-dismiss (0 = permanent)
 */
export function showToast(message, type = 'info', duration = 4000) {
  const container = ensureToastContainer();

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast__icon">${icons[type] || icons.info}</span>
    <div class="toast__body">
      <div class="toast__msg">${sanitize(message)}</div>
    </div>
  `;

  toast.addEventListener('click', () => dismiss(toast));
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => dismiss(toast), duration);
  }
}

function dismiss(toast) {
  toast.style.opacity = '0';
  toast.style.transform = 'translateX(20px)';
  toast.style.transition = 'all 0.25s ease';
  setTimeout(() => toast.remove(), 250);
}

/**
 * Redirect helpers.
 */
export function redirectTo(path) {
  window.location.href = path;
}

export function requireAuth() {
  if (!getToken()) {
    redirectTo('/frontend/pages/login.html');
    return false;
  }
  return true;
}

export function requireAdmin() {
  const user = getStoredUser();
  if (!user || user.role !== 'admin') {
    redirectTo('/voting.html');
    return false;
  }
  return true;
}
