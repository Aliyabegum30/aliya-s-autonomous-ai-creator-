const { fetchJson, fetchWithTimeout } = require('../utils/http');

// STEP 1 + STEP 2: DISCOVER + NORMALIZE
//
// Discovery is deliberately biased toward production AI failures.
// Editorial judgment remains the final authority.
//
// Sources:
//   1. Hacker News
//   2. Simon Willison
//   3. Stack Overflow Blog
//   4. Hugging Face Blog
//   5. OpenAI News

const HN_TOP_STORIES_URL =
  'https://hacker-news.firebaseio.com/v0/topstories.json';

const HN_ITEM_URL = (id) =>
  `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

const HN_STORIES_TO_SCAN = 80;
const HN_CONCURRENCY = 8;

const MIN_CANDIDATES = 8;
const MAX_CANDIDATES = 30;

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
  'token',
  'tokens',
  'training',
  'fine-tuning',
  'finetuning',
  'ai security',
  'model security',
  'production ai',
  'mlops',
  'ml pipeline',
  'data pipeline',
];

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
  'data loss',
  'data leak',
  'leaked',
  'incorrect',
  'wrong output',
  'silent failure',
  'reliability',
];

const STRONG_FAILURE_SIGNALS = [
  'postmortem',
  'root cause',
  'incident report',
  'production outage',
  'production incident',
  'service outage',
  'model regression',
  'silent regression',
  'data leak',
  'data loss',
  'security vulnerability',
  'memory leak',
  'resource exhaustion',
  'rollback',
  'production failure',
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

function normalizeText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function countMatches(haystack, keywords) {
  return keywords.reduce(
    (count, keyword) =>
      count + (haystack.includes(keyword) ? 1 : 0),
    0
  );
}

function relevanceScore(candidate) {
  const haystack =
    `${candidate.title || ''} ${candidate.snippet || ''}`.toLowerCase();

  const aiMatches = countMatches(
    haystack,
    AI_RELEVANCE_KEYWORDS
  );

  const failureMatches = countMatches(
    haystack,
    FAILURE_SIGNALS
  );

  const strongFailureMatches = countMatches(
    haystack,
    STRONG_FAILURE_SIGNALS
  );

  let score = 0;

  score += aiMatches * 2;
  score += failureMatches * 3;
  score += strongFailureMatches * 5;

  // Prefer stories that contain both an AI signal and
  // an actual failure/incident signal.
  if (aiMatches > 0 && failureMatches > 0) {
    score += 8;
  }

  // Strong incident language is especially valuable.
  if (strongFailureMatches > 0) {
    score += 10;
  }

  return score;
}

function isAiRelevant(candidate) {
  const haystack =
    `${candidate.title || ''} ${candidate.snippet || ''}`.toLowerCase();

  const aiMatches = countMatches(
    haystack,
    AI_RELEVANCE_KEYWORDS
  );

  const failureMatches = countMatches(
    haystack,
    FAILURE_SIGNALS
  );

  // Require either:
  //   - two independent AI/technology signals, or
  //   - one AI signal plus one failure signal.
  return (
    aiMatches >= 2 ||
    (aiMatches >= 1 && failureMatches >= 1)
  );
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

function candidateKey(candidate) {
  const url = String(candidate.url || '')
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '');

  if (url) {
    return `url:${url}`;
  }

  return `title:${String(candidate.title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')}`;
}

function deduplicateCandidates(candidates) {
  const seen = new Set();
  const result = [];

  for (const candidate of candidates) {
    const key = candidateKey(candidate);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(candidate);
  }

  return result;
}

async function discoverFromHackerNews() {
  const ids = await fetchJson(HN_TOP_STORIES_URL);

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error(
      'Hacker News returned no top story ids.'
    );
  }

  const idsToFetch = ids.slice(
    0,
    HN_STORIES_TO_SCAN
  );

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
      snippet: normalizeText(item.text || '').slice(
        0,
        500
      ),
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

  return normalized.filter(isAiRelevant);
}

function parseFeedXml(xml, sourceName) {
  if (typeof xml !== 'string' || xml.length === 0) {
    return [];
  }

  const itemMatches =
    xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  const entryMatches =
    xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];

  const entryBlocks =
    itemMatches.length > 0
      ? itemMatches
      : entryMatches;

  const extract = (block, tag) => {
    const match = block.match(
      new RegExp(
        `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
        'i'
      )
    );

    if (!match) {
      return '';
    }

    return match[1]
      .replace(/^<!\[CDATA\[/, '')
      .replace(/\]\]>$/, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const extractLink = (block) => {
    const atomLink = block.match(
      /<link[^>]*href=["']([^"']+)["'][^>]*>/i
    );

    if (atomLink) {
      return atomLink[1];
    }

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
      continue;
    }
  }

  if (allCandidates.length === 0) {
    throw new Error(
      'RSS sources produced no usable candidates.'
    );
  }

  return allCandidates.filter(isAiRelevant);
}

async function discoverTopics() {
  let hnCandidates = [];
  let rssCandidates = [];
  let hnError = null;
  let rssError = null;

  try {
    hnCandidates = await discoverFromHackerNews();
  } catch (err) {
    hnError = err;
  }

  try {
    rssCandidates = await discoverFromRss();
  } catch (err) {
    rssError = err;
  }

  const combined = deduplicateCandidates([
    ...hnCandidates,
    ...rssCandidates,
  ]);

  if (combined.length === 0) {
    throw new Error(
      `All discovery sources failed or produced no relevant candidates. ` +
      `HN: ${hnError ? hnError.message : 'ok'} | ` +
      `RSS: ${rssError ? rssError.message : 'ok'}`
    );
  }

  const ranked = sortByRelevance(combined).slice(
    0,
    MAX_CANDIDATES
  );

  if (ranked.length < MIN_CANDIDATES) {
    throw new Error(
      `Discovery produced only ${ranked.length} relevant candidates. ` +
      `HN: ${hnError ? hnError.message : 'ok'} | ` +
      `RSS: ${rssError ? rssError.message : 'ok'}`
    );
  }

  return {
    candidates: ranked,
    sourceUsed: [
      hnCandidates.length > 0 ? 'hackernews' : null,
      rssCandidates.length > 0 ? 'rss' : null,
    ]
      .filter(Boolean)
      .join('+'),
    hnError: hnError ? hnError.message : null,
    rssError: rssError ? rssError.message : null,
  };
}

module.exports = {
  discoverTopics,
  discoverFromHackerNews,
  discoverFromRss,
  parseFeedXml,
  isMalformed,
  relevanceScore,
  isAiRelevant,
  deduplicateCandidates,
};
