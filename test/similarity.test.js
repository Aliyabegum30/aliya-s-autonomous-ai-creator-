const test = require('node:test');
const assert = require('node:assert/strict');
const { topicKey, similarity, tokenize } = require('../src/utils/similarity');

test('topicKey is stable across word order and casing', () => {
  const a = topicKey('Gemini API rate limit outage');
  const b = topicKey('Outage: Gemini API Rate Limit');
  assert.equal(a, b);
});

test('topicKey drops stopwords', () => {
  const key = topicKey('The Model Hallucinated in Production');
  assert.ok(!key.includes('the'));
  assert.ok(key.includes('model'));
  assert.ok(key.includes('hallucinated'));
});

test('topicKey falls back to "untitled" for empty/stopword-only input', () => {
  assert.equal(topicKey(''), 'untitled');
  assert.equal(topicKey('the of and'), 'untitled');
});

test('similarity is 1 for identical text', () => {
  assert.equal(similarity('vector database outage', 'vector database outage'), 1);
});

test('similarity is 0 for completely different text', () => {
  assert.equal(similarity('vector database outage', 'quarterly funding round'), 0);
});

test('similarity is high for near-duplicate phrasing', () => {
  const score = similarity(
    'GPT-4 latency spike caused by retry storm',
    'Retry storm causes GPT-4 latency spike in production'
  );
  assert.ok(score >= 0.6, `expected high similarity, got ${score}`);
});

test('tokenize filters short and stopword tokens', () => {
  const tokens = tokenize('An AI is not a system');
  assert.deepEqual(tokens.sort(), ['ai', 'not', 'system'].sort());
});
