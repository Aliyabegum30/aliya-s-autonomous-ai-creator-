// STEP 1 (DISCOVER) + STEP 2 (NORMALIZE).
//
// Discovery is intentionally biased toward AI/technology sources.
// The editorial model should decide what is worth publishing;
// discovery's job is to give it GOOD candidates.
//
// Primary sources:
//   1. Hacker News
//   2. Simon Willison
//   3. Stack Overflow Blog
//   4. Hugging Face Blog
//   5. OpenAI News
//
// Hacker News is broad, so candidates are filtered using lightweight
// relevance signals before they enter the editorial LLM stage.
//
// Every candidate returned by discoverTopics() has:
//
//   {
//     title,
//     url,
//     snippet,
//     publishedAt,
//     sourceName
//   }
//
// Malformed candidates are removed before the rest of the pipeline.

const { fetchJson, fetchWithTimeout } = require('../utils/http');

const HN_TOP_STORIES_URL =
  'https://hacker-news.firebaseio.com/v0/topstories.json';

const HN_ITEM_URL = (id) =>
  `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

const HN_STORIES_TO_SCAN = 80;
const HN_CONCURRENCY = 8;

// We want enough candidates for the editorial model to make an actual
// decision instead of receiving only one or two stories.
const MIN_CANDIDATES = 8;
const MAX_CANDIDATES = 30;

// Lightweight discovery-level relevance terms.
//
// This is NOT the editorial filter.
// It only prevents obviously unrelated HN stories from consuming
// LLM calls.
const AI_RELEVANCE_KEYWORDS = [
  'ai',
  'artificial intelligence',
  'machine learning',
  'deep learning',
  'llm',
  'large language model',
  'language model',
  'generative ai',
  'genai',
  'agentic',
  'agent',
  'agents',
  'chatbot',
  'inference',
  'model serving',
  'model deployment',
  'model evaluation',
  'evaluation',
  'benchmark',
  'hallucination',
  'prompt injection',
  'jailbreak',
  'red team',
  'vector database',
  'embedding',
  'rag',
  'retrieval augmented',
  'gpu',
  'nvidia',
  'cuda',
  'transformer',
  'openai',
  'anthropic',
  'hugging face',
  'huggingface',
  'gemini',
  'claude',
  'mistral',
  'llama',
  'pytorch',
  'tensorflow',
  'ollama',
  'vllm',
  'inference',
  'token',
  'tokens',
  'training',
  'fine-tuning',
  'finetuning',
  'ai security',
  'model security',
  'ai outage',
  'ai incident',
  'ai failure',
  'production ai',
  'mlops',
  'ml pipeline',
  'data pipeline',
];

// Stronger signals are useful for ranking HN candidates.
// These don't automatically publish anything.
const FAILURE_SIGNALS = [
  'outage',
  'incident',
  'failure',
  'failed',
  'broken',
  'bug',
  'vulnerability',
  'exploit',
  'attack',
  'security',
  'regression',
  'downtime',
  'latency',
  'timeout',
  'rate limit',
  'rate-limit',
  'memory leak',
  'resource exhaustion',
  'production',
  'postmortem',
  'root cause',
  'rollback',
  'degraded',
  'degradation',
  'crash',
  'crashed',
  'misconfiguration',
  'misconfigured',
  'unexpected behavior',
  'unexpected behaviour',
  'incident report',
];

const RSS_FALLBACK_FEEDS = [
  {
    url: 'https://simonwillison.net/atom/everything/',
    sourceName: 'Simon Willison',
  },
  {
    url: 'https://stackoverflow.blog/feed/',
    sourceName: 'Stack Overflow Blog',
  },
  {
    url: 'https://huggingface.co/blog/feed.xml',
    sourceName: 'Hugging Face',
  },
  {
    url: 'https://openai.com/news/rss.xml',
    sourceName: 'OpenAI',
  },
];

function isMalformed(candidate) {
  return (
    !candidate ||
    typeof candidate.title !== 'string' ||
    candidate.title.trim().length === 0 ||
    typeof candidate.url !== 'string' ||
    candidate.url.trim().length === 0
  );
}

/**
 * Run async `fn` over `items` with at most `limit` in flight at once.
 */
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
        results[current] = null;
      }
    }
  }

  const workerCount = Math.min(limit, items.length);

  const workers = Array.from(
    { length: workerCount },
    () => worker()
  );

  await Promise.all(workers);

  return results;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function relevanceScore(candidate) {
  const haystack =
    `${candidate.title || ''} ${candidate.snippet || ''}`.toLowerCase();

  let score = 0;

  for (const keyword of AI_RELEVANCE_KEYWORDS) {
    if (haystack.includes(keyword)) {
      score += 2;
    }
  }

  for (const signal of FAILURE_SIGNALS) {
    if (haystack.includes(signal)) {
      score += 3;
    }
  }

  return score;
}

function isAiRelevant(candidate) {
  return relevanceScore(candidate) >= 2;
}

function sortByRelevance(candidates) {
  return [...candidates].sort((a, b) => {
    const scoreDifference =
      relevanceScore(b) - relevanceScore(a);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    const aTime = a.publishedAt
      ? new Date(a.publishedAt).getTime()
      : 0;

    const bTime = b.publishedAt
      ? new Date(b.publishedAt).getTime()
      : 0;

    return bTime - aTime;
  });
}

async function discoverFromHackerNews() {
  const ids = await fetchJson(HN_TOP_STORIES_URL);

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('Hacker News returned no top story ids.');
  }

  const idsToFetch = ids.slice(0, HN_STORIES_TO_SCAN);

  const items = await mapWithConcurrency(
    idsToFetch,
    HN_CONCURRENCY,
    (id) => fetchJson(HN_ITEM_URL(id))
  );

  const normalized = items
    .filter(Boolean)
    .filter(
      (item) =>
        item.type === 'story' &&
        !item.dead &&
        !item.deleted
    )
    .map((item) => ({
      title: item.title || '',
      url:
        item.url ||
        `https://news.ycombinator.com/item?id=${item.id}`,
      snippet: normalizeText(item.text || '').slice(0, 500),
      publishedAt: item.time
        ? new Date(item.time * 1000).toISOString()
        : null,
      sourceName: 'Hacker News',
    }))
    .filter((candidate) => !isMalformed(candidate));

  if (normalized.length === 0) {
    throw new Error(
      'Hacker News returned no usable story candidates.'
    );
  }

  // Remove obviously unrelated stories before LLM scoring.
  const relevant = normalized.filter(isAiRelevant);

  const ranked = sortByRelevance(relevant).slice(
    0,
    MAX_CANDIDATES
  );

  if (ranked.length < MIN_CANDIDATES) {
    // Do not fail discovery merely because HN had a slow AI-news day.
    // The RSS fallback will provide additional AI-focused candidates.
    throw new Error(
      `Hacker News produced only ${ranked.length} relevant candidates.`
    );
  }

  return ranked;
}

/**
 * Minimal dependency-free RSS/Atom parser.
 */
function parseFeedXml(xml, sourceName) {
  if (typeof xml !== 'string' || xml.length === 0) {
    return [];
  }

  const entryBlocks =
    xml.match(/<item[\s\S]*?<\/item>/gi) ||
    xml.match(/<entry[\s\S]*?<\/entry>/gi) ||
    [];

  const extract = (block, tag) => {
    const match = block.match(
      new RegExp(
        `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
        'i'
      )
    );

    if (!match) return '';

    return match[1]
      .replace(/^<!\[CDATA\[/, '')
      .replace(/\]\]>$/, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const extractLink = (block) => {
    // Atom:
    const atomLink = block.match(
      /<link[^>]*href=["']([^"']+)["'][^>]*>/i
    );

    if (atomLink) {
      return atomLink[1];
    }

    // RSS:
    return extract(block, 'link');
  };

  return entryBlocks
    .map((block) => {
      const title = extract(block, 'title');

      const url = extractLink(block);

      const snippet = (
        extract(block, 'description') ||
        extract(block, 'summary') ||
        extract(block, 'content') ||
        ''
      ).slice(0, 500);

      const rawDate =
        extract(block, 'pubDate') ||
        extract(block, 'updated') ||
        extract(block, 'published') ||
        extract(block, 'dc:date');

      const parsedDate = rawDate
        ? new Date(rawDate)
        : null;

      return {
        title,
        url,
        snippet,
        publishedAt:
          parsedDate &&
          !Number.isNaN(parsedDate.getTime())
            ? parsedDate.toISOString()
            : null,
        sourceName,
      };
    })
    .filter((candidate) => !isMalformed(candidate));
}

async function discoverFromRss() {
  const allCandidates = [];

  for (const feed of RSS_FALLBACK_FEEDS) {
    try {
      const res = await fetchWithTimeout(feed.url);

      if (!res.ok) {
        continue;
      }

      const xml = await res.text();

      const candidates = parseFeedXml(
        xml,
        feed.sourceName
      );

      allCandidates.push(...candidates);
    } catch (err) {
      // One unavailable feed must not kill discovery.
      continue;
    }
  }

  if (allCandidates.length === 0) {
    throw new Error(
      'RSS fallback produced no usable candidates.'
    );
  }

  const relevant = allCandidates.filter(isAiRelevant);

  const ranked = sortByRelevance(relevant).slice(
    0,
    MAX_CANDIDATES
  );

  if (ranked.length === 0) {
    throw new Error(
      'RSS fallback produced no AI/technology candidates.'
    );
  }

  return ranked;
}

/**
 * Discover live candidates.
 *
 * Strategy:
 *
 * 1. Try HN.
 * 2. If HN gives enough relevant candidates, use it.
 * 3. If HN is unavailable or too broad, use RSS.
 * 4. If RSS is also unavailable, report source_failure.
 */
async function discoverTopics() {
  let hnError = null;

  try {
    const candidates = await discoverFromHackerNews();

    return {
      candidates,
      sourceUsed: 'hackernews',
    };
  } catch (err) {
    hnError = err;
  }

  try {
    const candidates = await discoverFromRss();

    return {
      candidates,
      sourceUsed: 'rss',
      hnError: hnError ? hnError.message : null,
    };
  } catch (rssErr) {
    throw new Error(
      `All discovery sources failed. HN: ${
        hnError ? hnError.message : 'unknown error'
      } | RSS: ${rssErr.message}`
    );
  }
}

module.exports = {
  discoverTopics,
  discoverFromHackerNews,
  discoverFromRss,
  parseFeedXml,
  isMalformed,
  relevanceScore,
  isAiRelevant,
};