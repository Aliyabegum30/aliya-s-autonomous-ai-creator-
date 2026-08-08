const postsEl = document.getElementById('posts');
const rejectedEl = document.getElementById('rejected');
const cyclesEl = document.getElementById('cycles');
const statusEl = document.getElementById('status');
const agentIdInput = document.getElementById('agentId');
const loadBtn = document.getElementById('loadBtn');

const publishedCountEl = document.getElementById('publishedCount');
const rejectedCountEl = document.getElementById('rejectedCount');
const cycleCountEl = document.getElementById('cycleCount');
const latestOutcomeEl = document.getElementById('latestOutcome');

const rejectedBadgeEl = document.getElementById('rejectedBadge');
const cyclesBadgeEl = document.getElementById('cyclesBadge');

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatTimestamp(iso) {
  if (!iso) return 'Unknown time';

  try {
    return new Date(iso).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

function shortenId(id) {
  if (!id) return '';
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function shortenUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function renderPosts(posts) {
  publishedCountEl.textContent = posts.length;

  if (!posts.length) {
    postsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◌</div>
        <h3>No published intelligence</h3>
        <p>The agent has not published a post yet.</p>
      </div>
    `;
    return;
  }

  postsEl.innerHTML = posts.map((post, index) => {
    const sources = Array.isArray(post.sources) ? post.sources : [];

    return `
      <article class="post">
        <div class="post-header">
          <span class="post-number">POST / ${String(index + 1).padStart(2, '0')}</span>
          <span class="timestamp">
            ${escapeHtml(formatTimestamp(post.createdAt))}
            · ${escapeHtml(shortenId(post.id))}
          </span>
        </div>

        <p class="text">${escapeHtml(post.text)}</p>

        ${
          post.rationale
            ? `
              <div class="rationale">
                <strong>EDITORIAL RATIONALE</strong><br>
                ${escapeHtml(post.rationale)}
              </div>
            `
            : ''
        }

        ${
          sources.length
            ? `
              <div class="sources">
                ${sources.map(source => `
                  <a
                    class="source-link"
                    href="${escapeHtml(source)}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ↗ ${escapeHtml(shortenUrl(source))}
                  </a>
                `).join('')}
              </div>
            `
            : ''
        }
      </article>
    `;
  }).join('');
}

function renderRejected(items) {
  const rejected = Array.isArray(items) ? items : [];

  rejectedCountEl.textContent = rejected.length;
  rejectedBadgeEl.textContent = rejected.length;

  if (!rejected.length) {
    rejectedEl.innerHTML = `
      <div class="activity-empty">
        No rejected topics recorded.
      </div>
    `;
    return;
  }

  rejectedEl.innerHTML = rejected.map(item => `
    <div class="activity-item">
      <div class="activity-meta">
        ${escapeHtml(formatTimestamp(item.created_at))}
      </div>

      <div>
        <span class="activity-outcome">
          ${escapeHtml(item.reason || 'REJECTED')}
        </span>

        <span class="activity-topic">
          ${escapeHtml(item.topic || 'Unknown topic')}
        </span>
      </div>
    </div>
  `).join('');
}

function renderCycles(items) {
  const cycles = Array.isArray(items) ? items : [];

  cycleCountEl.textContent = cycles.length;
  cyclesBadgeEl.textContent = cycles.length;

  if (!cycles.length) {
    latestOutcomeEl.textContent = '—';

    cyclesEl.innerHTML = `
      <div class="activity-empty">
        No autonomous cycles recorded.
      </div>
    `;
    return;
  }

  latestOutcomeEl.textContent = String(cycles[0].outcome || 'UNKNOWN')
    .replace(/_/g, ' ');

  cyclesEl.innerHTML = cycles.map(cycle => `
    <div class="activity-item">
      <div class="activity-meta">
        ${escapeHtml(formatTimestamp(cycle.started_at))}
      </div>

      <div>
        <span class="activity-outcome">
          ${escapeHtml(cycle.outcome || 'UNKNOWN')}
        </span>
      </div>

      ${
        cycle.detail
          ? `<div class="activity-detail">${escapeHtml(cycle.detail)}</div>`
          : ''
      }
    </div>
  `).join('');
}

function setLoading(isLoading) {
  loadBtn.disabled = isLoading;

  if (isLoading) {
    loadBtn.innerHTML = `
      <span>LOADING</span>
      <span class="button-arrow">⋯</span>
    `;
  } else {
    loadBtn.innerHTML = `
      <span>LOAD FEED</span>
      <span class="button-arrow">→</span>
    `;
  }
}

async function loadFeed() {
  const agentId = agentIdInput.value.trim();

  if (!agentId) {
    statusEl.textContent = 'ERROR: Enter an agent ID first.';
    agentIdInput.focus();
    return;
  }

  setLoading(true);
  statusEl.textContent = 'Connecting to autonomous agent…';

  try {
    const [feedRes, demoRes] = await Promise.all([
      fetch(`/api/agent/feed?agentId=${encodeURIComponent(agentId)}`),
      fetch(`/internal/demo-data?agentId=${encodeURIComponent(agentId)}`)
    ]);

    if (!feedRes.ok) {
      const body = await feedRes.json().catch(() => ({}));

      statusEl.textContent =
        body.error || `Feed request failed (${feedRes.status}).`;

      postsEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">!</div>
          <h3>Unable to load feed</h3>
          <p>${escapeHtml(body.error || 'The agent could not be found.')}</p>
        </div>
      `;

      return;
    }

    const feed = await feedRes.json();
    const posts = Array.isArray(feed.posts) ? feed.posts : [];

    renderPosts(posts);

    if (demoRes.ok) {
      const demo = await demoRes.json();

      renderRejected(demo.rejectedTopics);
      renderCycles(demo.cycleRuns);
    } else {
      renderRejected([]);
      renderCycles([]);
    }

    statusEl.textContent =
      `CONNECTED · ${posts.length} published post${posts.length === 1 ? '' : 's'} loaded.`;

    localStorage.setItem(
      'postmortem_last_agent_id',
      agentId
    );

  } catch (error) {
    statusEl.textContent = `CONNECTION ERROR · ${error.message}`;

    postsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">!</div>
        <h3>Connection failed</h3>
        <p>Make sure the Node server is running on port 3000.</p>
      </div>
    `;
  } finally {
    setLoading(false);
  }
}

loadBtn.addEventListener('click', loadFeed);

agentIdInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    loadFeed();
  }
});

const savedAgentId = localStorage.getItem(
  'postmortem_last_agent_id'
);

if (savedAgentId) {
  agentIdInput.value = savedAgentId;
  loadFeed();
}
