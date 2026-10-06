/**
 * Sélection de paires WatchOut.
 * - Par défaut : banque locale aléatoire
 * - Si YOUTUBE_API_KEY : recherche YouTube (thèmes) pour composer des paires à durées proches
 */
'use strict';

const BANK = require('./video-pairs');

const THEME_QUERIES = {
  animals: {
    easy: [['funny dog fail', 'funny skateboard fail'], ['cat vs cucumber', 'baby laughing']],
    normal: [['dog falls in pool', 'cat falls off table'], ['dog steals food', 'cat steals food']],
    hard: [['dog jumps on couch fail', 'cat jumps on table fail'], ['puppy trip funny', 'kitten trip funny']]
  },
  fails: {
    easy: [['epic fail compilation short', 'funny animal'], ['trampoline fail', 'cooking fail']],
    normal: [['parkour fail', 'skateboard fall'], ['diving fail', 'jump fail funny']],
    hard: [['missed dive funny', 'missed jump into water'], ['almost made it fail', 'so close fail']]
  },
  sports: {
    easy: [['basketball miss funny', 'dog playing ball'], ['soccer fail funny', 'cat playing']],
    normal: [['basketball buzzer beater miss', 'soccer own goal funny'], ['tennis fail', 'golf fail funny']],
    hard: [['missed dunk', 'missed layup funny'], ['long jump fail', 'high jump fail']]
  },
  food: {
    easy: [['food challenge fail', 'skate fail'], ['cooking explosion', 'dog funny']],
    normal: [['dog steals hamburger', 'cat steals chicken'], ['food drop fail', 'cake fail']],
    hard: [['stealing food from table dog', 'stealing food from table cat']]
  },
  kids: {
    easy: [['baby surprised funny', 'dog surprised'], ['toddler dancing', 'cat dancing']],
    normal: [['kid reacts to gift', 'kid reacts to vegetable'], ['baby first steps fall', 'toddler first steps fall']],
    hard: [['kid tries jump fails', 'kid tries slide fails']]
  },
  weird: {
    easy: [['weirdest video short', 'funny commercial'], ['unexpected moment viral', 'animal vs robot']],
    normal: [['people reacting funny', 'animals reacting funny'], ['optical illusion fail', 'magic trick fail']],
    hard: [['almost the same moment viral', 'deja vu funny clip']]
  }
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function durationClose(a, b, maxDelta = 5) {
  return Math.abs(Number(a) - Number(b)) <= maxDelta;
}

function filterBank({ categories, difficulty, excludePairIds, maxVideoSec }) {
  const cats = new Set(categories || []);
  const excl = new Set(excludePairIds || []);
  return BANK.filter((p) => {
    if (excl.has(p.pairId)) return false;
    if (cats.size && !cats.has(p.category)) return false;
    if (difficulty && difficulty !== 'any' && p.difficulty !== difficulty) return false;
    const d = Math.max(p.mainVideo.duration, p.impostorVideo.duration);
    if (maxVideoSec && d > maxVideoSec) return false;
    return durationClose(p.mainVideo.duration, p.impostorVideo.duration, 8);
  });
}

function pickFromBank(opts) {
  let pool = filterBank(opts);
  if (!pool.length) {
    pool = filterBank({ ...opts, difficulty: 'any' });
  }
  if (!pool.length) {
    pool = BANK.filter((p) => !(opts.excludePairIds || []).includes(p.pairId));
  }
  if (!pool.length) pool = [...BANK];
  const pick = shuffle(pool)[0];
  return {
    ...pick,
    source: 'bank'
  };
}

async function ytGetJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  return res.json();
}

function parseIsoDuration(iso) {
  // PT1M2S / PT45S
  const m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  return (parseInt(m[1] || '0', 10) * 3600)
    + (parseInt(m[2] || '0', 10) * 60)
    + parseInt(m[3] || '0', 10);
}

async function searchCandidates(apiKey, query, maxVideoSec) {
  const searchUrl =
    'https://www.googleapis.com/youtube/v3/search?' +
    new URLSearchParams({
      key: apiKey,
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      maxResults: '8',
      q: query,
      safeSearch: 'moderate',
      relevanceLanguage: 'en'
    });
  const search = await ytGetJson(searchUrl);
  const ids = (search.items || []).map((it) => it.id?.videoId).filter(Boolean);
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
  return out;
}

async function pickFromYouTube(opts) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const categories = opts.categories?.length ? opts.categories : Object.keys(THEME_QUERIES);
  const difficulty = opts.difficulty && opts.difficulty !== 'any' ? opts.difficulty : 'normal';
  const cat = shuffle(categories)[0];
  const pack = THEME_QUERIES[cat] || THEME_QUERIES.weird;
  const queryPairs = pack[difficulty] || pack.normal || pack.easy;
  const [qMain, qImp] = shuffle(queryPairs)[0];

  try {
    const [mains, imps] = await Promise.all([
      searchCandidates(apiKey, qMain, opts.maxVideoSec),
      searchCandidates(apiKey, qImp, opts.maxVideoSec)
    ]);
    if (!mains.length || !imps.length) return null;

    // Cherche la meilleure paire à durée proche, IDs distincts
    let best = null;
    let bestDelta = Infinity;
    for (const a of shuffle(mains)) {
      for (const b of shuffle(imps)) {
        if (a.youtubeId === b.youtubeId) continue;
        const delta = Math.abs(a.duration - b.duration);
        if (delta <= 5 && delta < bestDelta) {
          bestDelta = delta;
          best = { a, b };
        }
      }
    }
    if (!best) {
      // assouplir à ±10s
      for (const a of mains) {
        for (const b of imps) {
          if (a.youtubeId === b.youtubeId) continue;
          const delta = Math.abs(a.duration - b.duration);
          if (delta <= 10 && delta < bestDelta) {
            bestDelta = delta;
            best = { a, b };
          }
        }
      }
    }
    if (!best) return null;

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
    console.warn('[watchout] YouTube API fallback to bank:', e.message);
    return null;
  }
}

/**
 * @param {{ categories?: string[], difficulty?: string, excludePairIds?: string[], maxVideoSec?: number }} opts
 */
async function pickPair(opts = {}) {
  const live = await pickFromYouTube(opts);
  if (live) return live;
  return pickFromBank(opts);
}

function listCategories() {
  return [...new Set(BANK.map((p) => p.category))];
}

module.exports = {
  pickPair,
  pickFromBank,
  listCategories,
  BANK,
  THEME_QUERIES
};
