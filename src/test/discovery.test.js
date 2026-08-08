const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFeedXml, isMalformed } = require('../src/agent/discovery');

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title>Silent regression in model routing</title>
    <link>https://example.com/a</link>
    <description><![CDATA[A detailed writeup of what broke.]]></description>
    <pubDate>Mon, 03 Aug 2026 10:00:00 GMT</pubDate>
  </item>
  <item>
    <title></title>
    <link>https://example.com/malformed</link>
  </item>
</channel></rss>`;

const SAMPLE_ATOM = `<?xml version="1.0"?>
<feed>
  <entry>
    <title>Cost blowout from unbounded retries</title>
    <link href="https://example.com/b" />
    <summary>Retries without backoff tripled inference spend.</summary>
    <updated>2026-08-03T10:00:00Z</updated>
  </entry>
</feed>`;

test('parseFeedXml extracts RSS items and drops malformed ones', () => {
  const items = parseFeedXml(SAMPLE_RSS, 'Test Feed');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Silent regression in model routing');
  assert.equal(items[0].url, 'https://example.com/a');
  assert.equal(items[0].sourceName, 'Test Feed');
  assert.ok(items[0].publishedAt);
});

test('parseFeedXml extracts Atom entries', () => {
  const items = parseFeedXml(SAMPLE_ATOM, 'Test Atom Feed');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Cost blowout from unbounded retries');
  assert.equal(items[0].url, 'https://example.com/b');
});

test('isMalformed flags missing title/url', () => {
  assert.equal(isMalformed({ title: '', url: 'https://x.com' }), true);
  assert.equal(isMalformed({ title: 'ok', url: '' }), true);
  assert.equal(isMalformed({ title: 'ok', url: 'https://x.com' }), false);
});
