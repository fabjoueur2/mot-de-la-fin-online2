/**
 * Sélection de paires WatchOut.
 * - Si YOUTUBE_API_KEY : recherche YouTube aléatoire par thème (catégories respectées)
 * - Sinon : banque locale filtrée par catégories
 */
'use strict';

const BANK = require('./video-pairs');

const THEME_QUERIES = {
  animals: {
    easy: [
      ['funny dog fail short', 'funny cat fail short'],
      ['dog vs vacuum', 'cat vs cucumber'],
      ['puppy first snow', 'kitten first snow'],
      ['dog scared of broccoli', 'cat scared of suitcase']
    ],
    normal: [
      ['dog falls in pool funny', 'cat falls off table funny'],
      ['dog steals food funny', 'cat steals pizza funny'],
      ['dog zoomies fail', 'cat jump fail'],
      ['parrot funny moment', 'goat scream funny']
    ],
    hard: [
      ['dog jumps on couch fail', 'cat jumps on counter fail'],
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
      ['diving board fail', 'pool jump fail funny'],
      ['football miss funny', 'basketball airball funny'],
      ['ladder fall funny', 'chair break fail']
    ],
    hard: [
      ['missed dive funny', 'missed jump water funny'],
      ['almost made it fail', 'so close sports fail'],
      ['wallride fail', 'rail grind fail skate'],
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
      ['badminton fail', 'table tennis fail'],
      ['archery miss funny', 'darts miss funny']
    ],
    hard: [
      ['missed dunk funny', 'missed layup funny'],
      ['long jump fail', 'high jump fail funny'],
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
      ['baking fail collapse', 'souffle fail'],
      ['ice cream drop fail', 'smoothie spill fail']
    ],
    hard: [
      ['stealing food from table dog', 'stealing food from table cat'],
      ['chef knife fail funny', 'cutting board fail'],
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
      ['child swings miss', 'kid slides funny fall']
    ],
    hard: [
      ['kid tries jump fails', 'kid tries cartwheel fails'],
      ['kid scooter fail', 'kid bike first time fall'],
      ['piñata miss kid', 'balloon pop scare kid'],
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

const QUERY_SPICE = [
  '',
  'shorts',
  'clip',
  'viral',
  'funny',
  '2023',
  '2024',
  '2025',
  'compilation',
  'moment'
];

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

function normalizeCategories(categories) {
  const all = Object.keys(THEME_QUERIES);
  if (!categories?.length) return all;
  const filtered = categories.filter((c) => all.includes(c));
  return filtered.length ? filtered : all;
}

function durationClose(a, b, maxDelta = 5) {
  return Math.abs(Number(a) - Number(b)) <= maxDelta;
}

function filterBank({ categories, difficulty, excludePairIds, maxVideoSec, looseDuration }) {
  const cats = categories?.length ? new Set(categories) : null;
  const excl = new Set(excludePairIds || []);
  return BANK.filter((p) => {
    if (excl.has(p.pairId)) return false;
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
    maxVideoSec: opts.maxVideoSec,
    difficulty: opts.difficulty
  };

  const attempts = [
    { ...base },
    { ...base, difficulty: 'any' },
    { ...base, difficulty: 'any', maxVideoSec: null },
    { ...base, difficulty: 'any', maxVideoSec: null, looseDuration: true },
    // Réautorise les paires déjà vues, mais garde les catégories
    { categories: cats, difficulty: 'any', maxVideoSec: null, looseDuration: true, excludePairIds: [] }
  ];

  for (const a of attempts) {
    const pool = filterBank(a);
    if (pool.length) {
      return { ...pickOne(shuffle(pool)), source: 'bank' };
    }
  }

  // Ne jamais sortir des catégories demandées
  if (cats?.length) return null;
  return { ...pickOne(shuffle(BANK)), source: 'bank' };
}

async function ytGetJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  return res.json();
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

function randomPublishedAfter() {
  // Fenêtre aléatoire sur ~18 mois pour varier le corpus
  const daysAgo = 14 + Math.floor(Math.random() * 520);
  return new Date(Date.now() - daysAgo * 864e5).toISOString();
}

async function searchCandidates(apiKey, query, maxVideoSec, excludeVideoIds) {
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
    maxResults: '15',
    q,
    order,
    safeSearch: 'moderate',
    relevanceLanguage: 'en',
    publishedAfter: randomPublishedAfter()
  };

  // videoDuration medium = 4-20 min trop long ; short = <4 min OK pour clips
  if (Math.random() < 0.7) params.videoDuration = 'short';

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
      id: ids.join(',')
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

async function pickFromYouTube(opts) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const categories = normalizeCategories(opts.categories);
  const difficulty =
    opts.difficulty && opts.difficulty !== 'any'
      ? opts.difficulty
      : pickOne(['easy', 'normal', 'hard']);
  const excludeVideoIds = opts.excludeVideoIds || [];

  // Plusieurs tentatives : thèmes / requêtes / ordres différents
  const catOrder = shuffle(categories);
  for (const cat of catOrder.slice(0, Math.min(3, catOrder.length))) {
    const pack = THEME_QUERIES[cat];
    if (!pack) continue;
    const queryPairs = shuffle(pack[difficulty] || pack.normal || pack.easy || []);
    for (const pairQueries of queryPairs.slice(0, 2)) {
      const [qMain, qImp] = pairQueries;
      try {
        const [mains, imps] = await Promise.all([
          searchCandidates(apiKey, qMain, opts.maxVideoSec, excludeVideoIds),
          searchCandidates(apiKey, qImp, opts.maxVideoSec, excludeVideoIds)
        ]);
        if (!mains.length || !imps.length) continue;

        let candidates = buildPairCandidates(mains, imps, excludeVideoIds, 5);
        if (!candidates.length) {
          candidates = buildPairCandidates(mains, imps, excludeVideoIds, 12);
        }
        if (!candidates.length) continue;

        const best = pickOne(shuffle(candidates));
        return {
          pairId: `yt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
          category: cat,
          difficulty,
          label: `${qMain} / ${qImp}`,
          mainVideo: { youtubeId: best.a.youtubeId, duration: best.a.duration },
          impostorVideo: { youtubeId: best.b.youtubeId, duration: best.b.duration },
          source: 'youtube-api'
        };
      } catch (e) {
        console.warn('[watchout] YouTube search attempt failed:', e.message);
      }
    }
  }

  return null;
}

/**
 * @param {{ categories?: string[], difficulty?: string, excludePairIds?: string[], excludeVideoIds?: string[], maxVideoSec?: number }} opts
 */
async function pickPair(opts = {}) {
  const cats = normalizeCategories(opts.categories);
  const live = await pickFromYouTube({ ...opts, categories: cats });
  if (live) return live;
  return pickFromBank({ ...opts, categories: cats });
}

function listCategories() {
  return Object.keys(THEME_QUERIES);
}

module.exports = {
  pickPair,
  pickFromBank,
  listCategories,
  BANK,
  THEME_QUERIES
};
