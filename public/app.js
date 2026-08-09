// Postmortem dashboard frontend.
// Automatically initializes an agent once, stores its ID locally,
// and then loads the read-only feed and dashboard telemetry.

const postsEl = document.getElementById('posts');
const rejectedEl = document.getElementById('rejected');
const cyclesEl = document.getElementById('cycles');
const statusEl = document.getElementById('status');

const agentIdInput = document.getElementById('agentId');
const loadBtn = document.getElementById('loadBtn');
const connectionForm = document.getElementById('connectionForm');
const connectionBadge = document.getElementById('connectionBadge');

const publishedCountEl = document.getElementById('publishedCount');
const rejectedCountEl = document.getElementById('rejectedCount');
const cycleCountEl = document.getElementById('cycleCount');
const latestOutcomeEl = document.getElementById('latestOutcome');

const rejectedBadgeEl = document.getElementById('rejectedBadge');
const cyclesBadgeEl = document.getElementById('cyclesBadge');
const rejectedCountBadgeEl = document.getElementById('rejectedCountBadge');
const cyclesCountBadgeEl = document.getElementById('cyclesCountBadge');

const REDUCE_MOTION =
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const STORAGE_KEY = 'postmortem_last_agent_id';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatTimestamp(iso) {
  try {
    return new Date(iso)
      .toISOString()
      .replace('T', ' ')
      .replace('Z', ' UTC');
  } catch {
    return iso;
  }
}

function shortenId(id) {
  if (!id) return '';
  const str = String(id);
  return str.length > 12 ? `${str.slice(0, 8)}…` : str;
}

function shortenUrl(url) {
  try {
    const u = new URL(url);
    const path =
      u.pathname !== '/'
        ? u.pathname.slice(0, 18) +
          (u.pathname.length > 18 ? '…' : '')
        : '';

    return u.hostname + path;
  } catch {
    return url;
  }
}

function animateNumber(el, target, duration = 600) {
  if (!el) return;

  target = Number(target) || 0;

  if (REDUCE_MOTION) {
    el.textContent = String(target);
    return;
  }

  const start = Number(el.textContent) || 0;

  if (start === target) {
    el.textContent = String(target);
    return;
  }

  const startTime = performance.now();

  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - (1 - progress) * (1 - progress);
    const value = Math.round(
      start + (target - start) * eased
    );

    el.textContent = String(value);

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

function animateElements(selector = '.reveal') {
  const els = document.querySelectorAll(selector);

  if (
    !('IntersectionObserver' in window) ||
    REDUCE_MOTION
  ) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  els.forEach((el) => observer.observe(el));
}

function revealPosts() {
  const cards = postsEl.querySelectorAll('.post');

  cards.forEach((card, i) => {
    if (REDUCE_MOTION) {
      card.classList.add('is-visible');
      return;
    }

    setTimeout(
      () => card.classList.add('is-visible'),
      i * 70
    );
  });
}

// ---------------------------------------------------------------------------
// Connection UI
// ---------------------------------------------------------------------------

function setLoading(isLoading) {
  if (agentIdInput) {
    agentIdInput.disabled = isLoading;
  }

  if (loadBtn) {
    loadBtn.disabled =
      isLoading ||
      (agentIdInput && agentIdInput.value.trim().length === 0);
  }

  if (loadBtn) {
    loadBtn.classList.toggle('is-loading', isLoading);
  }

  if (isLoading && connectionBadge) {
    connectionBadge.textContent = 'CONNECTING';
    connectionBadge.className =
      'panel-head-badge is-loading';
  }
}

function setConnectionState(state) {
  const map = {
    ready: {
      text: 'READY',
      cls: ''
    },
    success: {
      text: 'CONNECTED',
      cls: 'is-success'
    },
    error: {
      text: 'CONNECTION ERROR',
      cls: 'is-error'
    }
  };

  const cfg = map[state] || map.ready;

  if (connectionBadge) {
    connectionBadge.textContent = cfg.text;
    connectionBadge.className =
      `panel-head-badge ${cfg.cls}`.trim();
  }
}

function setAgentDisplay(agentId) {
  if (!agentIdInput) return;

  agentIdInput.value = agentId;

  // Keep the ID visible for transparency, but make it effectively
  // read-only because the dashboard now manages the connection.
  agentIdInput.readOnly = true;
}

function outcomeClass(outcome) {
  const o = String(outcome || '').toLowerCase();

  if (o === 'published') {
    return 'outcome-published';
  }

  if (
    o === 'rejected_all' ||
    o === 'source_failure'
  ) {
    return 'outcome-warn';
  }

  if (o === 'llm_failure') {
    return 'outcome-fail';
  }

  return 'outcome-warn';
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderPosts(posts) {
  if (!posts || !posts.length) {
    postsEl.innerHTML =
      '<p class="empty">No posts yet. The autonomous scheduler will publish when a qualifying incident is found.</p>';
    return;
  }

  postsEl.innerHTML = posts
    .map(
      (p, idx) => `
        <article class="post">
          <div class="post-meta">
            <span class="post-index">
              POST / ${String(posts.length - idx).padStart(2, '0')}
            </span>

            <span>
              ${escapeHtml(formatTimestamp(p.createdAt))}
            </span>

            <span>
              · id: ${escapeHtml(shortenId(p.id))}
            </span>
          </div>

          <p class="text">
            ${escapeHtml(p.text)}
          </p>

          <div class="rationale">
            <strong>Editorial rationale</strong>
            ${escapeHtml(p.rationale)}
          </div>

          <div class="sources">
            ${(p.sources || [])
              .map(
                (s) =>
                  `↗ ${escapeHtml(shortenUrl(s))}`
              )
              .join('')}
          </div>
        </article>
      `
    )
    .join('');

  revealPosts();
}

function renderRejected(items) {
  if (!items || !items.length) {
    rejectedEl.innerHTML =
      'No rejected topics recorded yet.';
    return;
  }

  rejectedEl.innerHTML = items
    .map(
      (r) => `
        <div class="rejected-item">
          <span class="reason">
            ${escapeHtml(r.reason)}
          </span>

          <div class="topic-text">
            ${escapeHtml(r.topic)}
          </div>

          <div class="item-time">
            ${escapeHtml(formatTimestamp(r.created_at))}
          </div>
        </div>
      `
    )
    .join('');
}

function renderCycles(items) {
  if (!items || !items.length) {
    cyclesEl.innerHTML =
      'No autonomous cycles recorded yet.';
    return;
  }

  cyclesEl.innerHTML = items
    .map(
      (c) => `
        <div class="cycle-item">
          <span class="outcome ${outcomeClass(c.outcome)}">
            ${escapeHtml(c.outcome)}
          </span>

          <span class="item-time">
            ${escapeHtml(formatTimestamp(c.started_at))}
          </span>

          ${
            c.detail
              ? `<div>${escapeHtml(c.detail)}</div>`
              : ''
          }
        </div>
      `
    )
    .join('');
}

function renderFeedError(message) {
  postsEl.innerHTML =
    `<p class="load-error">${escapeHtml(message)}</p>`;
}

function renderConnectionError(message) {
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = 'status is-error';
  }

  setConnectionState('error');
}

function updateTelemetry({
  published,
  rejected,
  cycles,
  latest
}) {
  animateNumber(
    publishedCountEl,
    published
  );

  animateNumber(
    rejectedCountEl,
    rejected
  );

  animateNumber(
    cycleCountEl,
    cycles
  );

  if (rejectedBadgeEl) {
    rejectedBadgeEl.textContent =
      String(rejected);
  }

  if (cyclesBadgeEl) {
    cyclesBadgeEl.textContent =
      String(cycles);
  }

  if (rejectedCountBadgeEl) {
    rejectedCountBadgeEl.textContent =
      String(rejected);
  }

  if (cyclesCountBadgeEl) {
    cyclesCountBadgeEl.textContent =
      String(cycles);
  }

  if (latestOutcomeEl) {
    latestOutcomeEl.textContent =
      latest || '—';
  }
}

// ---------------------------------------------------------------------------
// Agent initialization
// ---------------------------------------------------------------------------

async function initializeAgent() {
  const existingAgentId =
    localStorage.getItem(STORAGE_KEY);

  if (existingAgentId) {
    setAgentDisplay(existingAgentId);
    return existingAgentId;
  }

  if (statusEl) {
    statusEl.textContent =
      'Initializing autonomous agent…';
    statusEl.className = 'status';
  }

  setLoading(true);

  try {
    const response = await fetch(
      '/api/agent/init',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          persona: {
            name: 'Postmortem',
            domain: 'Production AI Failure Analysis'
          }
        })
      }
    );

    const data =
      await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error ||
          `Agent initialization failed (${response.status}).`
      );
    }

    if (!data.agentId) {
      throw new Error(
        'Server did not return an agentId.'
      );
    }

    localStorage.setItem(
      STORAGE_KEY,
      data.agentId
    );

    setAgentDisplay(data.agentId);

    return data.agentId;
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// Main feed load
// ---------------------------------------------------------------------------

async function loadFeed(agentIdOverride = null) {
  const agentId =
    agentIdOverride ||
    agentIdInput?.value.trim();

  if (!agentId) {
    renderConnectionError(
      'No autonomous agent is available.'
    );
    return;
  }

  setLoading(true);

  if (statusEl) {
    statusEl.textContent =
      'Loading autonomous intelligence…';
    statusEl.className = 'status';
  }

  try {
    const [feedRes, demoRes] =
      await Promise.all([
        fetch(
          `/api/agent/feed?agentId=${encodeURIComponent(agentId)}`
        ),

        fetch(
          `/internal/demo-data?agentId=${encodeURIComponent(agentId)}`
        )
      ]);

    if (!feedRes.ok) {
      const body =
        await feedRes.json().catch(() => ({}));

      const message =
        body.error ||
        `Feed request failed (${feedRes.status}).`;

      renderConnectionError(message);
      renderFeedError(message);
      return;
    }

    const feed = await feedRes.json();

    renderPosts(feed.posts);

    let published =
      (feed.posts || []).length;

    let rejectedCount = 0;
    let cycleCount = 0;
    let latestOutcome = '—';

    if (demoRes.ok) {
      const demo =
        await demoRes.json();

      renderRejected(
        demo.rejectedTopics
      );

      renderCycles(
        demo.cycleRuns
      );

      rejectedCount =
        (demo.rejectedTopics || []).length;

      cycleCount =
        (demo.cycleRuns || []).length;

      latestOutcome =
        (
          demo.cycleRuns &&
          demo.cycleRuns[0] &&
          demo.cycleRuns[0].outcome
        ) || '—';
    } else {
      rejectedEl.innerHTML =
        '<p class="empty">Editorial activity is temporarily unavailable.</p>';

      cyclesEl.innerHTML =
        '<p class="empty">Cycle history is temporarily unavailable.</p>';
    }

    updateTelemetry({
      published,
      rejected: rejectedCount,
      cycles: cycleCount,
      latest: latestOutcome
    });

    localStorage.setItem(
      STORAGE_KEY,
      agentId
    );

    if (statusEl) {
      statusEl.textContent =
        `${published} post(s) loaded · autonomous agent connected.`;

      statusEl.className =
        'status is-success';
    }

    setConnectionState('success');
    setAgentDisplay(agentId);

  } catch (err) {
    console.error(
      '[Postmortem dashboard]',
      err
    );

    renderConnectionError(
      `Network error: ${err.message}`
    );

    renderFeedError(
      'Could not reach the server. Check your connection and try again.'
    );
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

// Manual form submission is retained as a fallback.
// The normal visitor flow is automatic.
if (connectionForm) {
  connectionForm.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();

      if (agentIdInput?.value.trim()) {
        loadFeed();
      }
    }
  );
}

if (loadBtn) {
  loadBtn.addEventListener(
    'click',
    (event) => {
      event.preventDefault();

      if (agentIdInput?.value.trim()) {
        loadFeed();
      }
    }
  );
}

// Keep the existing dashboard animations.
animateElements('.reveal');

// ---------------------------------------------------------------------------
// Automatic startup
// ---------------------------------------------------------------------------

(async function startDashboard() {
  try {
    const agentId =
      await initializeAgent();

    await loadFeed(agentId);
  } catch (err) {
    console.error(
      '[Postmortem startup]',
      err
    );

    renderConnectionError(
      `Agent initialization failed: ${err.message}`
    );

    renderFeedError(
      'The autonomous agent could not be initialized. Please refresh the page.'
    );
  }
})();