const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePost, isValidIsoUtcTimestamp, isValidUrl } = require('../src/agent/validator');

function validPost(overrides = {}) {
  return {
    text: 'A retry storm in the inference gateway caused a 12x latency spike.',
    rationale: 'Selected because it names a concrete mechanism and is fresh.',
    sources: ['https://example.com/incident'],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test('isValidIsoUtcTimestamp accepts ISO strings and rejects garbage', () => {
  assert.equal(isValidIsoUtcTimestamp(new Date().toISOString()), true);
  assert.equal(isValidIsoUtcTimestamp('not a date'), false);
  assert.equal(isValidIsoUtcTimestamp(12345), false);
});

test('isValidUrl accepts http(s) and rejects other schemes/garbage', () => {
  assert.equal(isValidUrl('https://example.com'), true);
  assert.equal(isValidUrl('http://example.com'), true);
  assert.equal(isValidUrl('javascript:alert(1)'), false);
  assert.equal(isValidUrl('not a url'), false);
});

test('validatePost accepts a well-formed, grounded post', () => {
  const post = validPost();
  const result = validatePost(post, 'https://example.com/incident', []);
  assert.equal(result.valid, true);
});

test('validatePost rejects empty text', () => {
  const result = validatePost(validPost({ text: '  ' }), 'https://example.com/incident', []);
  assert.equal(result.valid, false);
});

test('validatePost rejects missing rationale', () => {
  const result = validatePost(validPost({ rationale: '' }), 'https://example.com/incident', []);
  assert.equal(result.valid, false);
});

test('validatePost rejects when no source URL is present', () => {
  const result = validatePost(validPost({ sources: [] }), 'https://example.com/incident', []);
  assert.equal(result.valid, false);
});

test('validatePost rejects when sources do not include the actually-discovered URL (grounding check)', () => {
  const result = validatePost(validPost({ sources: ['https://different.example.com/'] }), 'https://example.com/incident', []);
  assert.equal(result.valid, false);
});

test('validatePost rejects near-duplicate text against recent posts', () => {
  const recent = ['A retry storm in the inference gateway caused a 12x latency spike, engineers found.'];
  const result = validatePost(validPost(), 'https://example.com/incident', recent);
  assert.equal(result.valid, false);
});

test('validatePost rejects invalid createdAt', () => {
  const result = validatePost(validPost({ createdAt: 'not-a-date' }), 'https://example.com/incident', []);
  assert.equal(result.valid, false);
});
