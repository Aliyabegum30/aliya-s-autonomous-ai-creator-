// Demo page logic. Deliberately simple: fetch, render, done. This page is
// a viewer only — it never writes anything and never calls /internal/run-cycle.

const postsEl = document.getElementById('posts');
const rejectedEl = document.getElementById('rejected');
const cyclesEl = document.getElementById('cycles');
const statusEl = document.getElementById('status');
const agentIdInput = document.getElementById('agentId');
const loadBtn = document.getElementById('loadBtn');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTimestamp(iso) {
  try {
    return new Date(iso).toISOString().replace('T', ' ').replace('Z', ' UTC');
  } catch {
    return iso;
  }
}

function renderPosts(posts) {
  if (!posts.length) {
    postsEl.innerHTML = '<p class="empty">No posts yet. The scheduler publishes on its own cadence — check back later.</p>';
    return;
  }
  postsEl.innerHTML = posts
    .map(
      (p) => `
    <article class="post">
      <div class="timestamp">${escapeHtml(formatTimestamp(p.createdAt))} &middot; id: ${escapeHtml(p.id)}</div>
      <p class="text">${escapeHtml(p.text)}</p>
      <div class="rationale"><strong>Why this post:</strong> ${escapeHtml(p.rationale)}</div>
      <div class="sources">${p.sources.map((s) => `<a href="${escapeHtml(s)}" target="_blank" rel="noopener">${escapeHtml(s)}</a>`).join('<br/>')}</div>
    </article>`
    )
    .join('');
}

function renderRejected(items) {
  if (!items || !items.length) {
    rejectedEl.innerHTML = '<p class="empty">No rejected topics recorded yet.</p>';
    return;
  }
  rejectedEl.innerHTML = items
    .map(
      (r) => `<div class="rejected-item"><span class="reason">${escapeHtml(r.reason)}</span>${escapeHtml(r.topic)} — ${escapeHtml(formatTimestamp(r.created_at))}</div>`
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
      (c) => `<div class="cycle-item"><span class="outcome">${escapeHtml(c.outcome)}</span>${escapeHtml(formatTimestamp(c.started_at))}${c.detail ? ' — ' + escapeHtml(c.detail) : ''}</div>`
    )
    .join('');
}

async function loadFeed() {
  const agentId = agentIdInput.value.trim();
  if (!agentId) {
    statusEl.textContent = 'Enter an agentId first.';
    return;
  }

  statusEl.textContent = 'Loading…';
  try {
    const [feedRes, demoRes] = await Promise.all([
      fetch(`/api/agent/feed?agentId=${encodeURIComponent(agentId)}`),
      fetch(`/internal/demo-data?agentId=${encodeURIComponent(agentId)}`),
    ]);

    if (!feedRes.ok) {
      const body = await feedRes.json().catch(() => ({}));
      statusEl.textContent = body.error || `Feed request failed (${feedRes.status}).`;
      postsEl.innerHTML = '';
      return;
    }

    const feed = await feedRes.json();
    renderPosts(feed.posts);

    if (demoRes.ok) {
      const demo = await demoRes.json();
      renderRejected(demo.rejectedTopics);
      renderCycles(demo.cycleRuns);
    }

    statusEl.textContent = `${feed.posts.length} post(s) loaded.`;
    localStorage.setItem('postmortem_last_agent_id', agentId);
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  }
}

loadBtn.addEventListener('click', loadFeed);
agentIdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadFeed();
});

const savedAgentId = localStorage.getItem('postmortem_last_agent_id');
if (savedAgentId) {
  agentIdInput.value = savedAgentId;
  loadFeed();
}
