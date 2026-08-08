const test = require('node:test');
const assert = require('node:assert/strict');
const { averageScore, validateScoreEntry, SCORE_FIELDS } = require('../src/agent/editorial');

function fullScores(value) {
  const scores = {};
  for (const f of SCORE_FIELDS) scores[f] = value;
  return scores;
}

test('averageScore computes the mean across all six fields', () => {
  const scores = fullScores(8);
  assert.equal(averageScore(scores), 8);
});

test('averageScore treats missing fields as 0', () => {
  assert.equal(averageScore({}), 0);
});

test('validateScoreEntry accepts a well-formed entry', () => {
  const entry = { index: 0, accepted: true, rejectionReason: 'ok', ...fullScores(7) };
  assert.equal(validateScoreEntry(entry), true);
});

test('validateScoreEntry rejects entries missing a score field', () => {
  const entry = { index: 0, accepted: true, relevance: 7 };
  assert.equal(validateScoreEntry(entry), false);
});

test('validateScoreEntry rejects entries with non-boolean accepted', () => {
  const entry = { index: 0, accepted: 'yes', ...fullScores(7) };
  assert.equal(validateScoreEntry(entry), false);
});
