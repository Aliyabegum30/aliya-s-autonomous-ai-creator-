const test = require('node:test');
const assert = require('node:assert/strict');
const { applyDeterministicFilter, matchesAvoidList, isStale } = require('../src/agent/filter');

function candidate(overrides = {}) {
  return {
    title: 'A production AI incident with a named root cause',
    url: 'https://example.com/post',
    snippet: 'A detailed technical account of what went wrong.',
    publishedAt: new Date().toISOString(),
    sourceName: 'Hacker News',
    ...overrides,
  };
}

test('matchesAvoidList flags funding/valuation language', () => {
  const c = candidate({ title: 'Startup raises $50M Series B for AI agents' });
  assert.ok(matchesAvoidList(c));
});

test('matchesAvoidList does not flag a clean technical title', () => {
  const c = candidate({ title: 'Postmortem: silent model-version regression in production' });
  assert.equal(matchesAvoidList(c), null);
});

test('isStale is true for old timestamps and false for recent ones', () => {
  const old = candidate({ publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() });
  const fresh = candidate({ publishedAt: new Date().toISOString() });
  assert.equal(isStale(old), true);
  assert.equal(isStale(fresh), false);
});

test('isStale does not penalize missing timestamps', () => {
  const noDate = candidate({ publishedAt: null });
  assert.equal(isStale(noDate), false);
});

test('applyDeterministicFilter separates survivors from avoid-list rejections', () => {
  const candidates = [
    candidate({ title: 'Latency spike traced to retry storm in inference gateway' }),
    candidate({ title: 'AI startup announces new funding round and valuation' }),
  ];
  const { survivors, rejected } = applyDeterministicFilter(candidates);
  assert.equal(survivors.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason, 'avoid_list');
});

test('applyDeterministicFilter rejects stale candidates as below_threshold', () => {
  const stale = candidate({ publishedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() });
  const { survivors, rejected } = applyDeterministicFilter([stale]);
  assert.equal(survivors.length, 0);
  assert.equal(rejected[0].reason, 'below_threshold');
});
