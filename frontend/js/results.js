/**
 * results.js — Election results display
 * Fetches on-chain results via the backend and renders a rich bar chart.
 */
import { api, sanitize } from './api.js';

// Party color palette (cycles for more candidates)
const COLORS = [
  '#1d4ed8', '#06b6d4', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#ef4444', '#14b8a6',
];

/**
 * Fetch and display results for an election.
 * @param {string} electionId
 * @param {HTMLElement} container - target render container
 */
export async function loadAndRenderResults(electionId, container) {
  container.innerHTML = `
    <div style="text-align:center;padding:3rem">
      <div class="spinner spinner--lg" style="margin:0 auto"></div>
      <p style="margin-top:1rem;color:var(--c-gray-500)">Loading results from blockchain...</p>
    </div>`;

  try {
    const data = await api.get(`/api/blockchain/results/${electionId}`);
    renderResults(data, container);
  } catch (err) {
    container.innerHTML = `
      <div class="alert alert-danger">
        <span class="alert__icon">⚠</span>
        <div class="alert__content">
          <div class="alert__title">Could not load results</div>
          <p>${sanitize(err.message)}</p>
        </div>
      </div>`;
  }
}

/**
 * Render results to a container element.
 * @param {object} data - { election, results: { names, parties, votes } }
 * @param {HTMLElement} container
 */
export function renderResults(data, container) {
  const { election, results } = data;
  const { names, parties, votes } = results;

  const totalVotes = votes.reduce((sum, v) => sum + v, 0);
  const maxVotes = Math.max(...votes, 1);

  // Find winner(s)
  const maxV = Math.max(...votes);
  const winnerIndices = votes.map((v, i) => v === maxV ? i : -1).filter((i) => i >= 0);

  let html = `
    <div style="margin-bottom:2rem">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem">
        <div>
          <h3 style="color:var(--c-gray-900);margin-bottom:0.25rem">${sanitize(election.title)}</h3>
          <span class="badge ${election.status === 'active' ? 'badge-success' : 'badge-gray'} badge-dot">${election.status.toUpperCase()}</span>
        </div>
        <div class="stat-card" style="min-width:140px;text-align:center">
          <div class="stat-card__value">${totalVotes}</div>
          <div class="stat-card__label">Total Votes Cast</div>
        </div>
      </div>
    </div>

    <div style="margin-bottom:1.5rem">
      <p style="font-size:0.8rem;color:var(--c-gray-400);display:flex;align-items:center;gap:0.5rem">
        <span>⛓</span> Results read directly from the Ethereum smart contract
      </p>
    </div>
  `;

  // Results list
  html += '<div>';

  // Sort by votes descending for display
  const sorted = names.map((name, i) => ({ name, party: parties[i], votes: votes[i], index: i }))
    .sort((a, b) => b.votes - a.votes);

  sorted.forEach((item, rank) => {
    const pct = totalVotes > 0 ? ((item.votes / totalVotes) * 100).toFixed(1) : '0.0';
    const barWidth = maxVotes > 0 ? ((item.votes / maxVotes) * 100).toFixed(1) : '0';
    const isWinner = winnerIndices.includes(item.index) && totalVotes > 0;
    const color = COLORS[item.index % COLORS.length];

    html += `
      <div class="result-item" style="animation-delay:${rank * 0.12}s">
        <div class="result-meta">
          <div>
            <span class="result-name">${sanitize(item.name)}</span>
            ${isWinner && election.status === 'ended' ? ' <span class="badge badge-success" style="margin-left:0.5rem">🏆 Winner</span>' : ''}
            <div style="font-size:0.75rem;color:var(--c-gray-400);margin-top:2px">${sanitize(item.party)}</div>
          </div>
          <div style="text-align:right">
            <div class="result-votes">${item.votes.toLocaleString()} vote${item.votes !== 1 ? 's' : ''}</div>
            <div class="result-pct">${pct}%</div>
          </div>
        </div>
        <div class="progress-bar">
          <div class="progress-bar__fill" style="width:${barWidth}%;background:${color}"></div>
        </div>
      </div>
    `;
  });

  html += '</div>';

  if (totalVotes === 0) {
    html += `
      <div class="alert alert-info" style="margin-top:1rem">
        <span class="alert__icon">ℹ</span>
        <div>No votes have been cast yet.</div>
      </div>`;
  }

  container.innerHTML = html;
}
