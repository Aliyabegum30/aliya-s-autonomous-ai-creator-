// Demo page logic. Deliberately simple: fetch, render, done. This page is
// a viewer only — it never writes anything and never calls /internal/run-cycle.
// API calls and response shapes are unchanged from the previous version of
// this file; only presentation (rendering + animation) was upgraded.

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

const REDUCE_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Utilities (unchanged behavior, kept as named functions)
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatTimestamp(iso) {
  try {
    return new Date(iso).toISOString().replace('T', ' ').replace('Z', ' UTC');
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
    const path = u.pathname !== '/' ? u.pathname.slice(0, 18) + (u.pathname.length > 18 ? '…' : '') : '';
    return u.hostname + path;
  } catch {
    return url;
  }
}

/** Animates a number from its current displayed value up to `target`. */
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
    const eased = 1 - (1 - progress) * (1 - progress); // ease-out-quad
    const value = Math.round(start + (target - start) * eased);
    el.textContent = String(value);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/** Reveals elements with the `reveal` class (or a supplied selector) as they enter the viewport. */
function animateElements(selector = '.reveal') {
  const els = document.querySelectorAll(selector);
  if (!('IntersectionObserver' in window) || REDUCE_MOTION) {
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

/** Reveals post cards with a small stagger once they're in the DOM. */
function revealPosts() {
  const cards = postsEl.querySelectorAll('.post');
  cards.forEach((card, i) => {
    if (REDUCE_MOTION) {
      card.classList.add('is-visible');
      return;
    }
    setTimeout(() => card.classList.add('is-visible'), i * 70);
  });
}

/** Sets the connection panel's loading/error/success state. */
function setLoading(isLoading) {
  agentIdInput.disabled = isLoading;
  loadBtn.disabled = isLoading || agentIdInput.value.trim().length === 0;
  loadBtn.classList.toggle('is-loading', isLoading);
  if (isLoading) {
    connectionBadge.textContent = 'CONNECTING';
    connectionBadge.className = 'panel-head-badge is-loading';
  }
}

function setConnectionState(state) {
  // state: 'ready' | 'success' | 'error'
  const map = {
    ready: { text: 'READY FOR INPUT', cls: '' },
    success: { text: 'CONNECTED', cls: 'is-success' },
    error: { text: 'CONNECTION ERROR', cls: 'is-error' },
  };
  const cfg = map[state] || map.ready;
  connectionBadge.textContent = cfg.text;
  connectionBadge.className = `panel-head-badge ${cfg.cls}`.trim();
}

function outcomeClass(outcome) {
  const o = String(outcome || '').toLowerCase();
  if (o === 'published') return 'outcome-published';
  if (o === 'rejected_all' || o === 'source_failure') return 'outcome-warn';
  if (o === 'llm_failure') return 'outcome-fail';
  return 'outcome-warn';
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderPosts(posts) {
  if (!posts || !posts.length) {
    postsEl.innerHTML = '<p class="empty">No posts yet. The scheduler publishes on its own cadence — check back later.</p>';
    return;
  }
  postsEl.innerHTML = posts
    .map(
      (p, idx) => `
    <article class="post">
      <div class="post-meta">
        <span class="post-index">POST / ${String(posts.length - idx).padStart(2, '0')}</span>
        <span>${escapeHtml(formatTimestamp(p.createdAt))}</span>
        <span>· id: ${escapeHtml(shortenId(p.id))}</span>
      </div>
      <p class="text">${escapeHtml(p.text)}</p>
      <div class="rationale"><strong>Editorial rationale</strong>${escapeHtml(p.rationale)}</div>
      <div class="sources">${(p.sources || [])
        .map(
          (s) =>
            `<a href="${escapeHtml(s)}" target="_blank" rel="noopener">↗ ${escapeHtml(shortenUrl(s))}</a>`
        )
        .join('')}</div>
    </article>`
    )
    .join('');
  revealPosts();
}

function renderRejected(items) {
  if (!items || !items.length) {
    rejectedEl.innerHTML = '<p class="empty">No rejected topics recorded yet.</p>';
    return;
  }
  rejectedEl.innerHTML = items
    .map(
      (r) => `
    <div class="rejected-item">
      <span class="reason">${escapeHtml(r.reason)}</span>
      <div class="topic-text">${escapeHtml(r.topic)}</div>
      <div class="item-time">${escapeHtml(formatTimestamp(r.created_at))}</div>
    </div>`
    )
    .join('');
}

function renderCycles(items) {
  if (!items || !items.length) {
    cyclesEl.innerHTML = '<p class="empty">No autonomous cycles recorded yet.</p>';
    return;
  }
  cyclesEl.innerHTML = items
    .map(
      (c) => `
    <div class="cycle-item">
      <span class="outcome ${outcomeClass(c.outcome)}">${escapeHtml(c.outcome)}</span>
      <span class="item-time">${escapeHtml(formatTimestamp(c.started_at))}</span>
      ${c.detail ? `<div class="detail">${escapeHtml(c.detail)}</div>` : ''}
    </div>`
    )
    .join('');
}

function renderFeedError(message) {
  postsEl.innerHTML = `<p class="load-error">${escapeHtml(message)}</p>`;
}

function renderConnectionError(message) {
  statusEl.textContent = message;
  statusEl.className = 'status is-error';
  setConnectionState('error');
}

function updateTelemetry({ published, rejected, cycles, latest }) {
  animateNumber(publishedCountEl, published);
  animateNumber(rejectedCountEl, rejected);
  animateNumber(cycleCountEl, cycles);
  if (rejectedBadgeEl) rejectedBadgeEl.textContent = String(rejected);
  if (cyclesBadgeEl) cyclesBadgeEl.textContent = String(cycles);
  if (rejectedCountBadgeEl) rejectedCountBadgeEl.textContent = String(rejected);
  if (cyclesCountBadgeEl) cyclesCountBadgeEl.textContent = String(cycles);
  if (latestOutcomeEl) latestOutcomeEl.textContent = latest || '—';
}

// ---------------------------------------------------------------------------
// Main load flow — same two endpoints, same fields, as the previous version
// ---------------------------------------------------------------------------

async function loadFeed() {
  const agentId = agentIdInput.value.trim();
  if (!agentId) {
    statusEl.textContent = 'Enter an agentId first.';
    statusEl.className = 'status';
    return;
  }

  setLoading(true);
  statusEl.textContent = 'Loading…';
  statusEl.className = 'status';

  try {
    const [feedRes, demoRes] = await Promise.all([
      fetch(`/api/agent/feed?agentId=${encodeURIComponent(agentId)}`),
      fetch(`/internal/demo-data?agentId=${encodeURIComponent(agentId)}`),
    ]);

    if (!feedRes.ok) {
      const body = await feedRes.json().catch(() => ({}));
      const message = body.error || `Feed request failed (${feedRes.status}).`;
      renderConnectionError(message);
      renderFeedError(message);
      setLoading(false);
      return;
    }

    const feed = await feedRes.json();
    renderPosts(feed.posts);

    let published = feed.posts.length;
    let rejectedCount = 0;
    let cycleCount = 0;
    let latestOutcome = '—';

    if (demoRes.ok) {
      const demo = await demoRes.json();
      renderRejected(demo.rejectedTopics);
      renderCycles(demo.cycleRuns);
      rejectedCount = (demo.rejectedTopics || []).length;
      cycleCount = (demo.cycleRuns || []).length;
      latestOutcome = (demo.cycleRuns && demo.cycleRuns[0] && demo.cycleRuns[0].outcome) || '—';
    } else {
      // Feed succeeded but the demo-data convenience endpoint failed — the
      // feed itself still renders; we just can't show rejected/cycles data.
      rejectedEl.innerHTML = '<p class="empty">Editorial activity is temporarily unavailable.</p>';
      cyclesEl.innerHTML = '<p class="empty">Cycle history is temporarily unavailable.</p>';
    }

    updateTelemetry({ published, rejected: rejectedCount, cycles: cycleCount, latest: latestOutcome });

    statusEl.textContent = `${feed.posts.length} post(s) loaded.`;
    statusEl.className = 'status is-success';
    setConnectionState('success');
    localStorage.setItem('postmortem_last_agent_id', agentId);
  } catch (err) {
    renderConnectionError(`Network error: ${err.message}`);
    renderFeedError('Could not reach the server. Check your connection and try again.');
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

if (connectionForm) {
  connectionForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loadFeed();
  });
}
loadBtn.addEventListener('click', (e) => {
  e.preventDefault();
  loadFeed();
});
agentIdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    loadFeed();
  }
});
agentIdInput.addEventListener('input', () => {
  loadBtn.disabled = agentIdInput.value.trim().length === 0;
});

animateElements('.reveal');

const savedAgentId = localStorage.getItem('postmortem_last_agent_id');
if (savedAgentId) {
  agentIdInput.value = savedAgentId;
  loadFeed();
}
