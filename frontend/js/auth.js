/**
 * auth.js — Authentication logic
 * Handles registration, login, and JWT management.
 */
import { api, setToken, clearToken, setStoredUser, getStoredUser, showToast, redirectTo } from './api.js';

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Register a new voter account.
 * @param {object} formData
 */
export async function register(formData) {
  const { name, email, password, walletAddress, idNumber } = formData;
  const data = await api.post('/api/auth/register', { name, email, password, walletAddress, idNumber });
  setToken(data.token);
  setStoredUser(data.user);
  return data;
}

// ── Login ─────────────────────────────────────────────────────────────────────

/**
 * Login with email + password. Returns the response data (includes token + user).
 * @param {string} email
 * @param {string} password
 */
export async function login(email, password) {
  const data = await api.post('/api/auth/login', { email, password });
  setToken(data.token);
  setStoredUser(data.user);
  return data;
}

// ── Logout ────────────────────────────────────────────────────────────────────

export function logout() {
  clearToken();
  showToast('You have been signed out', 'info');
  setTimeout(() => redirectTo('/voting.html'), 800);
}

// ── Profile ───────────────────────────────────────────────────────────────────

/**
 * Fetch the current user profile from the server (refreshes local cache).
 */
export async function fetchProfile() {
  const data = await api.get('/api/auth/me');
  setStoredUser(data.user);
  return data.user;
}

// ── Client-side form validation ───────────────────────────────────────────────

/**
 * Validate a registration form.
 * Returns { valid: boolean, errors: object }
 */
export function validateRegistrationForm(fields) {
  const errors = {};

  if (!fields.name || fields.name.trim().length < 2) {
    errors.name = 'Full name must be at least 2 characters';
  }

  if (!fields.email || !/^\S+@\S+\.\S+$/.test(fields.email)) {
    errors.email = 'Please enter a valid email address';
  }

  if (!fields.password || fields.password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  } else if (!/[A-Z]/.test(fields.password)) {
    errors.password = 'Password must contain at least one uppercase letter';
  } else if (!/[0-9]/.test(fields.password)) {
    errors.password = 'Password must contain at least one number';
  }

  if (fields.password !== fields.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
  }

  if (!fields.walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(fields.walletAddress)) {
    errors.walletAddress = 'Please enter a valid Ethereum wallet address (0x...)';
  }

  if (!fields.idNumber || fields.idNumber.trim().length === 0) {
    errors.idNumber = 'Identification number is required';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Display validation errors next to form fields.
 * @param {object} errors - { fieldName: 'error message' }
 */
export function displayFieldErrors(errors) {
  // Clear previous errors
  document.querySelectorAll('.form-error').forEach((el) => (el.textContent = ''));
  document.querySelectorAll('.form-input.error').forEach((el) => el.classList.remove('error'));

  Object.entries(errors).forEach(([field, message]) => {
    const input = document.getElementById(field);
    const errorEl = document.getElementById(`${field}-error`);
    if (input) input.classList.add('error');
    if (errorEl) errorEl.textContent = message;
  });
}

/**
 * Clear all field errors.
 */
export function clearFieldErrors() {
  document.querySelectorAll('.form-error').forEach((el) => (el.textContent = ''));
  document.querySelectorAll('.form-input.error').forEach((el) => el.classList.remove('error'));
}
