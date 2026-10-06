/**
 * Sélection de paires WatchOut.
 * - Priorité : YouTube Data API (aléatoire, catégories respectées)
 * - Fallback : banque locale (aussi filtrée par catégories)
 */
'use strict';

const BANK = require('./video-pairs');

const THEME_QUERIES = {
  animals: {
    easy: [
      ['funny dog fail short', 'funny cat fail short'],
      ['dog vs vacuum funny', 'cat vs cucumber funny'],
      ['puppy first snow funny', 'kitten first snow funny'],
      ['dog scared broccoli', 'cat scared suitcase']
    ],
    normal: [
      ['dog falls in pool funny', 'cat falls off table funny'],
      ['dog steals food funny', 'cat steals pizza funny'],
      ['dog zoomies fail', 'cat jump fail funny'],
      ['parrot funny moment', 'goat scream funny']
    ],
    hard: [
      ['dog jumps couch fail', 'cat jumps counter fail'],
      ['puppy trip funny', 'kitten trip funny'],
      ['dog sneezes funny', 'cat sneezes funny'],
      ['dog opens door funny', 'cat opens door funny']
    ]
  },
  fails: {
    easy: [
      ['trampoline fail funny', 'skateboard beginner fail'],
      ['cooking fail funny short', 'diy fail funny short'],
      ['treadmill fail funny', 'escalator fail funny'],
      ['ice slip fail funny', 'bike fall funny short']
    ],
    normal: [
      ['parkour fail funny', 'skateboard fall funny'],
      ['diving board fail funny', 'pool jump fail funny'],
      ['football miss funny', 'basketball airball funny'],
      ['ladder fall funny', 'chair break fail']
    ],
    hard: [
      ['missed dive funny', 'missed jump water funny'],
      ['almost made it fail', 'so close sports fail'],
      ['wallride fail skate', 'rail grind fail skate'],
      ['backflip fail funny', 'front flip fail funny']
    ]
  },
  sports: {
    easy: [
      ['basketball miss funny short', 'soccer fail funny short'],
      ['tennis fail funny', 'golf swing fail funny'],
      ['bowling gutter funny', 'ping pong fail funny'],
      ['volleyball fail funny', 'frisbee fail funny']
    ],
    normal: [
      ['basketball buzzer beater miss', 'soccer own goal funny'],
      ['rugby fail funny', 'hockey fail funny'],
      ['badminton fail funny', 'table tennis fail funny'],
      ['archery miss funny', 'darts miss funny']
    ],
    hard: [
      ['missed dunk funny', 'missed layup funny'],
      ['long jump fail funny', 'high jump fail funny'],
      ['penalty miss funny', 'free throw airball'],
      ['skateboard trick almost', 'bmx trick almost']
    ]
  },
  food: {
    easy: [
      ['cooking fail explosion', 'cake fail funny'],
      ['blender fail funny', 'microwave fail funny'],
      ['pizza fail funny', 'burger drop fail'],
      ['noodle challenge fail', 'spicy food fail funny']
    ],
    normal: [
      ['dog steals hamburger', 'cat steals chicken'],
      ['food drop fail restaurant', 'waiter fail tray'],
      ['baking fail collapse', 'souffle fail funny'],
      ['ice cream drop fail', 'smoothie spill fail']
    ],
    hard: [
      ['stealing food from table dog', 'stealing food from table cat'],
      ['chef fail funny short', 'cutting board fail funny'],
      ['barbecue flare fail', 'grill fail funny'],
      ['fondue fail funny', 'chocolate fountain fail']
    ]
  },
  kids: {
    easy: [
      ['baby surprised funny', 'toddler surprised gift'],
      ['toddler dancing funny', 'baby laughing hiccup'],
      ['kid first ice cream', 'kid first lemon funny'],
      ['baby sneezes funny', 'toddler yawns funny']
    ],
    normal: [
      ['kid reacts to gift funny', 'kid reacts to vegetable'],
      ['baby first steps fall', 'toddler first steps fall'],
      ['kid magic trick fail', 'kid science experiment fail'],
      ['child swing miss', 'kid slide funny fall']
    ],
    hard: [
      ['kid tries jump fails', 'kid tries cartwheel fails'],
      ['kid scooter fail', 'kid bike first time fall'],
      ['pinata miss kid', 'balloon pop scare kid'],
      ['kid bowling fail', 'kid soccer miss funny']
    ]
  },
  weird: {
    easy: [
      ['unexpected moment viral short', 'oddly satisfying fail'],
      ['weird talent funny short', 'strange invention fail'],
      ['optical illusion funny', 'magic trick fail street'],
      ['robot fail funny', 'drone crash funny short']
    ],
    normal: [
      ['people reacting funny short', 'animals reacting funny'],
      ['elevator prank reaction', 'sudden scare funny'],
      ['wind storm funny fail', 'umbrella fail wind'],
      ['automatic door fail', 'revolving door fail']
    ],
    hard: [
      ['almost the same moment funny', 'deja vu clip funny'],
      ['coincidence funny video', 'timing perfect fail'],
      ['mirror prank reaction', 'mannequin scare funny'],
      ['glitch in matrix funny', 'unexpected plot twist clip']
    ]
  }
};

const QUERY_SPICE = ['', 'shorts', 'clip', 'viral', 'funny', '2024', '2025', 'moment'];
const SEARCH_ORDERS = ['relevance', 'date', 'viewCount', 'rating'];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickOne(arr) {
  if (!arr?.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function isYoutubeConfigured() {
  const k = process.env.YOUTUBE_API_KEY;
  return Boolean(k && String(k).startsWith('AIza') && String(k).length >= 20);
}

function normalizeCategories(categories) {
  const all = Object.keys(THEME_QUERIES);
  if (!categories?.length) return all;
  const filtered = categories.filter((c) => all.includes(c));
  return filtered.length ? filtered : all;
}

function durationClose(a, b, maxDelta = 5) {
  return Math.abs(Number(a) - Number(b)) <= maxDelta;
}

function filterBank({ categories, difficulty, excludePairIds, excludeVideoIds, maxVideoSec, looseDuration }) {
  const cats = categories?.length ? new Set(categories) : null;
  const exclPairs = new Set(excludePairIds || []);
  const exclVideos = new Set(excludeVideoIds || []);
  return BANK.filter((p) => {
    if (exclPairs.has(p.pairId)) return false;
    if (exclVideos.has(p.mainVideo.youtubeId) || exclVideos.has(p.impostorVideo.youtubeId)) {
      return false;
    }
    if (cats && !cats.has(p.category)) return false;
    if (difficulty && difficulty !== 'any' && p.difficulty !== difficulty) return false;
    const d = Math.max(p.mainVideo.duration, p.impostorVideo.duration);
    if (maxVideoSec && d > maxVideoSec) return false;
    if (!looseDuration && !durationClose(p.mainVideo.duration, p.impostorVideo.duration, 8)) {
      return false;
    }
    return true;
  });
}

function pickFromBank(opts) {
  const cats = opts.categories?.length ? [...opts.categories] : null;
  const base = {
    categories: cats,
    excludePairIds: opts.excludePairIds,
    excludeVideoIds: opts.excludeVideoIds,
    maxVideoSec: opts.maxVideoSec,
    difficulty: opts.difficulty
  };

  const attempts = [
    { ...base },
    { ...base, difficulty: 'any' },
    { ...base, difficulty: 'any', maxVideoSec: null },
    { ...base, difficulty: 'any', maxVideoSec: null, looseDuration: true },
    {
      categories: cats,
      difficulty: 'any',
      maxVideoSec: null,
      looseDuration: true,
      excludePairIds: [],
      excludeVideoIds: opts.excludeVideoIds
    },
    {
      categories: cats,
      difficulty: 'any',
      maxVideoSec: null,
      looseDuration: true,
      excludePairIds: [],
      excludeVideoIds: []
    }
  ];

  for (const a of attempts) {
    const pool = filterBank(a);
    if (pool.length) {
      const pick = pickOne(shuffle(pool));
      return { ...pick, source: 'bank' };
    }
  }
  return null;
}

async function ytGetJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || `YouTube API ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

function parseIsoDuration(iso) {
  const m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  return (
    parseInt(m[1] || '0', 10) * 3600 +
    parseInt(m[2] || '0', 10) * 60 +
    parseInt(m[3] || '0', 10)
  );
}

async function searchCandidates(apiKey, query, maxVideoSec, excludeVideoIds, mode) {
  const excl = new Set(excludeVideoIds || []);
  const spice = pickOne(QUERY_SPICE);
  const order = pickOne(SEARCH_ORDERS);
  const q = spice ? `${query} ${spice}` : query;

  const params = {
    key: apiKey,
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    videoSyndicated: 'true',
    maxResults: '25',
    q,
    order,
    safeSearch: 'moderate'
  };

  // mode 'strict' = plus de variation ; mode 'loose' = max résultats
  if (mode === 'strict') {
    params.relevanceLanguage = 'en';
    if (Math.random() < 0.65) params.videoDuration = 'short';
    if (Math.random() < 0.55) {
      const daysAgo = 21 + Math.floor(Math.random() * 600);
      params.publishedAfter = new Date(Date.now() - daysAgo * 864e5).toISOString();
    }
  } else {
    params.videoDuration = 'short';
  }

  const searchUrl =
    'https://www.googleapis.com/youtube/v3/search?' + new URLSearchParams(params);
  const search = await ytGetJson(searchUrl);
  const ids = (search.items || [])
    .map((it) => it.id?.videoId)
    .filter((id) => id && !excl.has(id));
  if (!ids.length) return [];

  const detailsUrl =
    'https://www.googleapis.com/youtube/v3/videos?' +
    new URLSearchParams({
      key: apiKey,
      part: 'contentDetails,status,snippet',
      id: ids.slice(0, 25).join(',')
    });
  const details = await ytGetJson(detailsUrl);
  const out = [];
  for (const v of details.items || []) {
    if (v.status?.embeddable === false) continue;
    if (excl.has(v.id)) continue;
    const duration = parseIsoDuration(v.contentDetails?.duration);
    if (!duration || duration < 8) continue;
    if (maxVideoSec && duration > maxVideoSec) continue;
    if (duration > 90) continue;
    out.push({
      youtubeId: v.id,
      duration,
      title: v.snippet?.title || ''
    });
  }
  return shuffle(out);
}

function buildPairCandidates(mains, imps, excludeVideoIds, maxDelta) {
  const excl = new Set(excludeVideoIds || []);
  const out = [];
  for (const a of mains) {
    if (excl.has(a.youtubeId)) continue;
    for (const b of imps) {
      if (excl.has(b.youtubeId)) continue;
      if (a.youtubeId === b.youtubeId) continue;
      const delta = Math.abs(a.duration - b.duration);
      if (delta <= maxDelta) out.push({ a, b, delta });
    }
  }
  return out;
}

async function tryPairFromQueries(apiKey, cat, difficulty, qMain, qImp, opts) {
  for (const mode of ['strict', 'loose']) {
    const [mains, imps] = await Promise.all([
      searchCandidates(apiKey, qMain, opts.maxVideoSec, opts.excludeVideoIds, mode),
      searchCandidates(apiKey, qImp, opts.maxVideoSec, opts.excludeVideoIds, mode)
    ]);
    if (!mains.length || !imps.length) continue;

    let candidates = buildPairCandidates(mains, imps, opts.excludeVideoIds, 5);
    if (!candidates.length) {
      candidates = buildPairCandidates(mains, imps, opts.excludeVideoIds, 15);
    }
    if (!candidates.length) continue;

    const best = pickOne(shuffle(candidates));
    return {
      pairId: `yt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      category: cat,
      difficulty,
      label: `${qMain} / ${qImp}`,
      mainVideo: { youtubeId: best.a.youtubeId, duration: best.a.duration },
      impostorVideo: { youtubeId: best.b.youtubeId, duration: best.b.duration },
      source: 'youtube-api'
    };
  }
  return null;
}

async function pickFromYouTube(opts) {
  if (!isYoutubeConfigured()) return null;
  const apiKey = process.env.YOUTUBE_API_KEY;

  const categories = normalizeCategories(opts.categories);
  const difficulty =
    opts.difficulty && opts.difficulty !== 'any'
      ? opts.difficulty
      : pickOne(['easy', 'normal', 'hard']);

  const catOrder = shuffle(categories);
  const errors = [];

  for (const cat of catOrder) {
    const pack = THEME_QUERIES[cat];
    if (!pack) continue;
    const queryPairs = shuffle(pack[difficulty] || pack.normal || pack.easy || []);
    for (const pairQueries of queryPairs.slice(0, 3)) {
      const [qMain, qImp] = pairQueries;
      try {
        const pair = await tryPairFromQueries(apiKey, cat, difficulty, qMain, qImp, opts);
        if (pair) return pair;
      } catch (e) {
        errors.push(e.message);
        console.warn('[watchout] YouTube attempt failed:', e.message);
      }
    }
  }

  if (errors.length) {
    console.warn('[watchout] YouTube API unavailable, fallback bank. Last error:', errors[errors.length - 1]);
  } else {
    console.warn('[watchout] YouTube returned no pair for cats=', categories.join(','));
  }
  return null;
}

/**
 * @param {{ categories?: string[], difficulty?: string, excludePairIds?: string[], excludeVideoIds?: string[], maxVideoSec?: number }} opts
 */
async function pickPair(opts = {}) {
  const cats = normalizeCategories(opts.categories);
  const live = await pickFromYouTube({ ...opts, categories: cats });
  if (live) {
    console.log(
      '[watchout] pair source=youtube-api cat=%s main=%s imp=%s',
      live.category,
      live.mainVideo.youtubeId,
      live.impostorVideo.youtubeId
    );
    return live;
  }
  const bank = pickFromBank({ ...opts, categories: cats });
  if (bank) {
    console.log(
      '[watchout] pair source=bank cat=%s main=%s imp=%s (API %s)',
      bank.category,
      bank.mainVideo.youtubeId,
      bank.impostorVideo.youtubeId,
      isYoutubeConfigured() ? 'failed/empty' : 'MISSING KEY'
    );
  }
  return bank;
}

function listCategories() {
  return Object.keys(THEME_QUERIES);
}

module.exports = {
  pickPair,
  pickFromBank,
  listCategories,
  isYoutubeConfigured,
  BANK,
  THEME_QUERIES
};
