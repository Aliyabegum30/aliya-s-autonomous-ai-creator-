// Route-level tests against the real Express app, with `storage/queries`
// and `agent/controller` mocked so nothing touches a real database, the
// network, or an LLM. Run with: node --test test/

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.RUN_CYCLE_SECRET = 'test-secret';

const queries = require('../src/storage/queries');
const controller = require('../src/agent/controller');
const app = require('../src/app');

function withMocks(queryOverrides, controllerOverrides, fn) {
  const originalQueries = {};
  for (const key of Object.keys(queryOverrides || {})) {
    originalQueries[key] = queries[key];
    queries[key] = queryOverrides[key];
  }
  const originalController = {};
  for (const key of Object.keys(controllerOverrides || {})) {
    originalController[key] = controller[key];
    controller[key] = controllerOverrides[key];
  }

  return fn().finally(() => {
    for (const key of Object.keys(originalQueries)) queries[key] = originalQueries[key];
    for (const key of Object.keys(originalController)) controller[key] = originalController[key];
  });
}

async function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function stopServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

const VALID_AGENT_ID = 'a0000000-0000-0000-0000-000000000001';
const UNKNOWN_AGENT_ID = 'b0000000-0000-0000-0000-000000000002';

// ---- POST /api/agent/init -------------------------------------------------

test('POST /api/agent/init returns 201 and an agentId for a valid persona', async () => {
  const server = await startServer();
  const port = server.address().port;
  let cycleTriggered = false;

  try {
    await withMocks(
      { createAgent: async (persona) => ({ agent_id: VALID_AGENT_ID, persona, created_at: new Date() }) },
      { runCycle: async () => { cycleTriggered = true; return { outcome: 'published' }; } },
      async () => {
        const res = await fetch(`http://localhost:${port}/api/agent/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ persona: { name: 'Postmortem', domain: 'Production AI Failure Analysis' } }),
        });
        assert.equal(res.status, 201);
        const body = await res.json();
        assert.equal(body.agentId, VALID_AGENT_ID);

        // the best-effort cycle is fire-and-forget; give it a tick to run
        await new Promise((r) => setTimeout(r, 20));
        assert.equal(cycleTriggered, true);
      }
    );
  } finally {
    await stopServer(server);
  }
});

test('POST /api/agent/init returns 400 when persona is missing', async () => {
  const server = await startServer();
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/api/agent/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  } finally {
    await stopServer(server);
  }
});

test('POST /api/agent/init returns 400 when persona.name is empty', async () => {
  const server = await startServer();
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/api/agent/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: { name: '', domain: 'AI Security' } }),
    });
    assert.equal(res.status, 400);
  } finally {
    await stopServer(server);
  }
});

// ---- GET /api/agent/feed --------------------------------------------------

test('GET /api/agent/feed returns 400 when agentId is missing', async () => {
  const server = await startServer();
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/api/agent/feed`);
    assert.equal(res.status, 400);
  } finally {
    await stopServer(server);
  }
});

test('GET /api/agent/feed returns 400 when agentId is malformed', async () => {
  const server = await startServer();
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/api/agent/feed?agentId=not-a-uuid`);
    assert.equal(res.status, 400);
  } finally {
    await stopServer(server);
  }
});

test('GET /api/agent/feed returns 404 for an unknown (but valid-format) agentId', async () => {
  const server = await startServer();
  const port = server.address().port;
  try {
    await withMocks({ getAgent: async () => null }, {}, async () => {
      const res = await fetch(`http://localhost:${port}/api/agent/feed?agentId=${UNKNOWN_AGENT_ID}`);
      assert.equal(res.status, 404);
    });
  } finally {
    await stopServer(server);
  }
});

test('GET /api/agent/feed returns an empty array for a known agent with no posts', async () => {
  const server = await startServer();
  const port = server.address().port;
  try {
    await withMocks(
      { getAgent: async () => ({ agent_id: VALID_AGENT_ID }), getPostsForAgent: async () => [] },
      {},
      async () => {
        const res = await fetch(`http://localhost:${port}/api/agent/feed?agentId=${VALID_AGENT_ID}`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.deepEqual(body, { posts: [] });
      }
    );
  } finally {
    await stopServer(server);
  }
});

test('GET /api/agent/feed returns posts newest-first with the required shape', async () => {
  const server = await startServer();
  const port = server.address().port;
  const older = { id: 'p1', created_at: new Date('2026-08-01T00:00:00Z'), text: 'older', rationale: 'r1', sources: ['https://a.example.com'] };
  const newer = { id: 'p2', created_at: new Date('2026-08-05T00:00:00Z'), text: 'newer', rationale: 'r2', sources: ['https://b.example.com'] };

  try {
    // getPostsForAgent is expected to already return newest-first (it's an
    // ORDER BY created_at DESC in the real query) — the route must not
    // reorder or drop that ordering.
    await withMocks(
      { getAgent: async () => ({ agent_id: VALID_AGENT_ID }), getPostsForAgent: async () => [newer, older] },
      {},
      async () => {
        const res = await fetch(`http://localhost:${port}/api/agent/feed?agentId=${VALID_AGENT_ID}`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.posts.length, 2);
        assert.equal(body.posts[0].id, 'p2');
        assert.equal(body.posts[1].id, 'p1');
        assert.equal(body.posts[0].createdAt, '2026-08-05T00:00:00.000Z');
        assert.deepEqual(body.posts[0].sources, ['https://b.example.com']);
        assert.ok('rationale' in body.posts[0]);
      }
    );
  } finally {
    await stopServer(server);
  }
});

// ---- POST /internal/run-cycle ---------------------------------------------

test('POST /internal/run-cycle returns 401 with no Authorization header', async () => {
  const server = await startServer();
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/internal/run-cycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: VALID_AGENT_ID }),
    });
    assert.equal(res.status, 401);
  } finally {
    await stopServer(server);
  }
});

test('POST /internal/run-cycle returns 401 with the wrong secret', async () => {
  const server = await startServer();
  const port = server.address().port;
  try {
    const res = await fetch(`http://localhost:${port}/internal/run-cycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-secret' },
      body: JSON.stringify({ agentId: VALID_AGENT_ID }),
    });
    assert.equal(res.status, 401);
  } finally {
    await stopServer(server);
  }
});

test('POST /internal/run-cycle returns 404 for an unknown agentId even with a valid secret', async () => {
  const server = await startServer();
  const port = server.address().port;
  try {
    await withMocks({ getAgent: async () => null }, {}, async () => {
      const res = await fetch(`http://localhost:${port}/internal/run-cycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-secret' },
        body: JSON.stringify({ agentId: UNKNOWN_AGENT_ID }),
      });
      assert.equal(res.status, 404);
    });
  } finally {
    await stopServer(server);
  }
});

test('POST /internal/run-cycle triggers the pipeline and returns its outcome with a valid secret + known agent', async () => {
  const server = await startServer();
  const port = server.address().port;
  try {
    await withMocks(
      { getAgent: async () => ({ agent_id: VALID_AGENT_ID }) },
      { runCycle: async (agentId) => ({ outcome: 'rejected_all', detail: 'nothing cleared the bar', agentId }) },
      async () => {
        const res = await fetch(`http://localhost:${port}/internal/run-cycle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-secret' },
          body: JSON.stringify({ agentId: VALID_AGENT_ID }),
        });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.outcome, 'rejected_all');
      }
    );
  } finally {
    await stopServer(server);
  }
});
