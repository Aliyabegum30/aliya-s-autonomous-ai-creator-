// STEP 1 (DISCOVER) + STEP 2 (NORMALIZE).
//
// Primary source: Hacker News Firebase API (live, no key required).
// Fallback: a small curated RSS bundle, used only if HN is unreachable,
// times out, rate-limits, or returns nothing usable.
//
// Every candidate returned by discoverTopics() has the normalized shape:
//   { title, url, snippet, publishedAt, sourceName }
// Malformed candidates (no title, no url) are dropped here, before any
// further pipeline stage sees them.

const { fetchJson, fetchWithTimeout } = require('../utils/http');

const HN_TOP_STORIES_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json';
const HN_ITEM_URL = (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
const HN_STORIES_TO_SCAN = 40; // how many top-story ids to inspect per cycle
const HN_CONCURRENCY = 8;

// Small curated fallback bundle. Used only when HN discovery fails
// entirely. Intentionally short — this is a safety net, not the primary
// discovery mechanism. Verify these are still live before relying on them
// in production; feeds do occasionally move or shut down.
const RSS_FALLBACK_FEEDS = [
  { url: 'https://simonwillison.net/atom/everything/', sourceName: 'Simon Willison' },
  { url: 'https://stackoverflow.blog/feed/', sourceName: 'Stack Overflow Blog' },
];

function isMalformed(candidate) {
  return !candidate || typeof candidate.title !== 'string' || candidate.title.trim().length === 0
    || typeof candidate.url !== 'string' || candidate.url.trim().length === 0;
}

/** Run async `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency(items, limit, fn) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      try {
        results[current] = await fn(items[current]);
      } catch (err) {
        results[current] = null; // one bad item must not fail the batch
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function discoverFromHackerNews() {
  const ids = await fetchJson(HN_TOP_STORIES_URL);
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('Hacker News returned no top story ids.');
  }

  const idsToFetch = ids.slice(0, HN_STORIES_TO_SCAN);
  const items = await mapWithConcurrency(idsToFetch, HN_CONCURRENCY, (id) => fetchJson(HN_ITEM_URL(id)));

  const candidates = items
    .filter(Boolean)
    .filter((item) => item.type === 'story' && !item.dead && !item.deleted)
    .map((item) => ({
      title: item.title || '',
      url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
      snippet: item.text ? String(item.text).replace(/<[^>]+>/g, ' ').slice(0, 500) : '',
      publishedAt: item.time ? new Date(item.time * 1000).toISOString() : null,
      sourceName: 'Hacker News',
    }))
    .filter((c) => !isMalformed(c));

  if (candidates.length === 0) {
    throw new Error('Hacker News returned no usable story candidates after normalization.');
  }
  return candidates;
}

/**
 * Minimal, dependency-free RSS/Atom parser. Good enough for the small,
 * known-shape fallback feeds above — not a general-purpose feed parser.
 */
function parseFeedXml(xml, sourceName) {
  const entryBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];

  const extract = (block, tag) => {
    const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    if (!match) return '';
    return match[1]
      .replace(/^<!\[CDATA\[|\]\]>$/g, '')
      .replace(/<[^>]+>/g, ' ')
      .trim();
  };

  const extractLink = (block) => {
    const atomLink = block.match(/<link[^>]*href=["']([^"']+)["']/i);
    if (atomLink) return atomLink[1];
    const rssLink = extract(block, 'link');
    return rssLink;
  };

  return entryBlocks
    .map((block) => {
      const title = extract(block, 'title');
      const url = extractLink(block);
      const snippet = (extract(block, 'description') || extract(block, 'summary') || '').slice(0, 500);
      const rawDate = extract(block, 'pubDate') || extract(block, 'updated') || extract(block, 'published');
      const parsedDate = rawDate ? new Date(rawDate) : null;
      return {
        title,
        url,
        snippet,
        publishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
        sourceName,
      };
    })
    .filter((c) => !isMalformed(c));
}

async function discoverFromRss() {
  const allCandidates = [];
  for (const feed of RSS_FALLBACK_FEEDS) {
    try {
      const res = await fetchWithTimeout(feed.url);
      if (!res.ok) continue;
      const xml = await res.text();
      allCandidates.push(...parseFeedXml(xml, feed.sourceName));
    } catch (err) {
      // One dead feed must not take down the fallback path.
      continue;
    }
  }
  if (allCandidates.length === 0) {
    throw new Error('RSS fallback produced no usable candidates.');
  }
  return allCandidates;
}

/**
 * @returns {Promise<{candidates: object[], sourceUsed: 'hackernews'|'rss'}>}
 * @throws if BOTH the primary and fallback source fail — caller records this
 *   as a `source_failure` cycle outcome and does not crash.
 */
async function discoverTopics() {
  try {
    const candidates = await discoverFromHackerNews();
    return { candidates, sourceUsed: 'hackernews' };
  } catch (hnErr) {
    try {
      const candidates = await discoverFromRss();
      return { candidates, sourceUsed: 'rss', hnError: hnErr.message };
    } catch (rssErr) {
      throw new Error(`All discovery sources failed. HN: ${hnErr.message} | RSS: ${rssErr.message}`);
    }
  }
}

module.exports = { discoverTopics, discoverFromHackerNews, discoverFromRss, parseFeedXml, isMalformed };
