// These tests exercise the FULL orchestration logic in controller.js with
// every external dependency (discovery, editorial LLM call, generator LLM
// call, and the database) replaced with in-memory mocks. This verifies the
// pipeline's control flow and outcome recording without touching the
// network or a real database — neither is reachable from this sandbox.
//
// Each test monkeypatches methods on the already-`require`d dependency
// modules (Node's module cache means controller.js sees the same mutated
// object) and restores them in `finally`.

const test = require('node:test');
const assert = require('node:assert/strict');

const discovery = require('../src/agent/discovery');
const memory = require('../src/agent/memory');
const editorial = require('../src/agent/editorial');
const generator = require('../src/agent/generator');
const queries = require('../src/storage/queries');
const controller = require('../src/agent/controller');

const AGENT_ID = 'a0000000-0000-0000-0000-000000000001';

function withMocks(overrides, fn) {
  const originals = {};
  for (const [moduleName, methods] of Object.entries(overrides)) {
    const mod = { discovery, memory, editorial, generator, queries }[moduleName];
    originals[moduleName] = {};
    for (const [method, impl] of Object.entries(methods)) {
      originals[moduleName][method] = mod[method];
      mod[method] = impl;
    }
  }
  return fn().finally(() => {
    for (const [moduleName, methods] of Object.entries(overrides)) {
      const mod = { discovery, memory, editorial, generator, queries }[moduleName];
      for (const method of Object.keys(methods)) {
        mod[method] = originals[moduleName][method];
      }
    }
  });
}

function baseQueryMocks(overrides = {}) {
  const calls = { insertRejectedTopic: [], finishCycleRun: [], insertPost: [] };
  return {
    calls,
    mocks: {
      getRecentCycleRuns: async () => [],
      startCycleRun: async () => 'cycle-1',
      finishCycleRun: async (id, outcome, detail) => {
        calls.finishCycleRun.push({ id, outcome, detail });
      },
      insertRejectedTopic: async (agentId, topic, reason, scores) => {
        calls.insertRejectedTopic.push({ agentId, topic, reason, scores });
      },
      insertSignature: async () => {},
      getRecentPostTexts: async () => [],
      insertPost: async (agentId, post) => {
        const row = { id: 'post-1', created_at: new Date().toISOString(), ...post };
        calls.insertPost.push(row);
        return row;
      },
      touchAgentLastRun: async () => {},
      ...overrides,
    },
  };
}

const SAMPLE_CANDIDATE = {
  title: 'Retry storm caused a 12x latency spike in the inference gateway',
  url: 'https://example.com/incident',
  snippet: 'Detailed technical writeup.',
  publishedAt: new Date().toISOString(),
  sourceName: 'Hacker News',
};

test('runCycle publishes when every stage succeeds', async () => {
  const { calls, mocks } = baseQueryMocks();

  await withMocks(
    {
      discovery: { discoverTopics: async () => ({ candidates: [SAMPLE_CANDIDATE], sourceUsed: 'hackernews' }) },
      memory: {
        applyMemoryCheck: async (agentId, candidates) => ({
          survivors: candidates.map((c) => ({ ...c, topicKey: 'retry-storm-latency' })),
          rejected: [],
        }),
      },
      editorial: {
        applyEditorialJudgment: async (candidates) => ({
          accepted: candidates.map((c) => ({ ...c, editorialScores: {}, editorialAverage: 8 })),
          rejected: [],
        }),
      },
      generator: {
        generatePost: async () => ({ text: 'The gateway retried without backoff, tripling load.', rationale: 'Names a mechanism and is fresh.' }),
      },
      queries: mocks,
    },
    async () => {
      const result = await controller.runCycle(AGENT_ID);
      assert.equal(result.outcome, 'published');
      assert.equal(result.postId, 'post-1');
      assert.equal(calls.insertPost.length, 1);
      assert.equal(calls.finishCycleRun[0].outcome, 'published');
    }
  );
});

test('runCycle records source_failure when discovery fails entirely', async () => {
  const { calls, mocks } = baseQueryMocks();

  await withMocks(
    { discovery: { discoverTopics: async () => { throw new Error('HN and RSS both down'); } }, queries: mocks },
    async () => {
      const result = await controller.runCycle(AGENT_ID);
      assert.equal(result.outcome, 'source_failure');
      assert.equal(calls.finishCycleRun[0].outcome, 'source_failure');
    }
  );
});

test('runCycle records rejected_all when editorial judgment rejects every candidate', async () => {
  const { calls, mocks } = baseQueryMocks();

  await withMocks(
    {
      discovery: { discoverTopics: async () => ({ candidates: [SAMPLE_CANDIDATE], sourceUsed: 'hackernews' }) },
      memory: {
        applyMemoryCheck: async (agentId, candidates) => ({
          survivors: candidates.map((c) => ({ ...c, topicKey: 'retry-storm-latency' })),
          rejected: [],
        }),
      },
      editorial: {
        applyEditorialJudgment: async () => ({
          accepted: [],
          rejected: [{ topic: SAMPLE_CANDIDATE.title, reason: 'below_threshold', scores: { average: 3 } }],
        }),
      },
      queries: mocks,
    },
    async () => {
      const result = await controller.runCycle(AGENT_ID);
      assert.equal(result.outcome, 'rejected_all');
      assert.equal(calls.insertRejectedTopic.length, 1);
      assert.equal(calls.insertRejectedTopic[0].reason, 'below_threshold');
    }
  );
});

test('runCycle records a duplicate rejection from the memory check and still publishes the surviving candidate', async () => {
  const { calls, mocks } = baseQueryMocks();
  const duplicateCandidate = { ...SAMPLE_CANDIDATE, title: 'A repeated angle on the same incident' };
  const freshCandidate = { ...SAMPLE_CANDIDATE, title: 'Cost blowout from unbounded retry loop' };

  await withMocks(
    {
      discovery: { discoverTopics: async () => ({ candidates: [duplicateCandidate, freshCandidate], sourceUsed: 'hackernews' }) },
      memory: {
        applyMemoryCheck: async () => ({
          survivors: [{ ...freshCandidate, topicKey: 'cost-blowout-retry' }],
          rejected: [{ topic: duplicateCandidate.title, reason: 'duplicate', scores: { match: 'exact' } }],
        }),
      },
      editorial: {
        applyEditorialJudgment: async (candidates) => ({
          accepted: candidates.map((c) => ({ ...c, editorialScores: {}, editorialAverage: 9 })),
          rejected: [],
        }),
      },
      generator: {
        generatePost: async () => ({ text: 'Unbounded retries tripled inference spend within an hour.', rationale: 'Names a mechanism, fresh, no alternative was stronger.' }),
      },
      queries: mocks,
    },
    async () => {
      const result = await controller.runCycle(AGENT_ID);
      assert.equal(result.outcome, 'published');
      const duplicateLog = calls.insertRejectedTopic.find((r) => r.reason === 'duplicate');
      assert.ok(duplicateLog, 'expected the duplicate candidate to be logged to rejected_topics');
    }
  );
});

test('runCycle records llm_failure when editorial scoring throws', async () => {
  const { calls, mocks } = baseQueryMocks();

  await withMocks(
    {
      discovery: { discoverTopics: async () => ({ candidates: [SAMPLE_CANDIDATE], sourceUsed: 'hackernews' }) },
      memory: {
        applyMemoryCheck: async (agentId, candidates) => ({
          survivors: candidates.map((c) => ({ ...c, topicKey: 'retry-storm-latency' })),
          rejected: [],
        }),
      },
      editorial: { applyEditorialJudgment: async () => { throw new Error('Gemini timed out'); } },
      queries: mocks,
    },
    async () => {
      const result = await controller.runCycle(AGENT_ID);
      assert.equal(result.outcome, 'llm_failure');
      assert.equal(calls.finishCycleRun[0].outcome, 'llm_failure');
    }
  );
});

test('runCycle skips when a recent in-progress cycle is still active (overlap guard)', async () => {
  const { calls, mocks } = baseQueryMocks({
    getRecentCycleRuns: async () => [{ outcome: 'in_progress', started_at: new Date().toISOString() }],
  });
  let startCalled = false;
  mocks.startCycleRun = async () => {
    startCalled = true;
    return 'cycle-should-not-start';
  };

  await withMocks({ queries: mocks }, async () => {
    const result = await controller.runCycle(AGENT_ID);
    assert.equal(result.outcome, 'skipped');
    assert.equal(startCalled, false);
  });
});
