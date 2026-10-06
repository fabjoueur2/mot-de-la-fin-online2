/**
 * Génère games/watchout/video-pairs.js via YouTube Data API (besoin de .env).
 */
'use strict';
const fs = require('fs');
const path = require('path');

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (process.env[k] == null) process.env[k] = v;
}

const { THEME_QUERIES, pickPair } = require('../games/watchout/youtube');

(async () => {
  if (!process.env.YOUTUBE_API_KEY) {
    console.error('YOUTUBE_API_KEY manquant');
    process.exit(1);
  }

  const pairs = [];
  const used = [];
  const cats = Object.keys(THEME_QUERIES);
  const diffs = ['easy', 'normal', 'hard'];

  for (const cat of cats) {
    for (const difficulty of diffs) {
      for (let n = 0; n < 2; n++) {
        const p = await pickPair({
          categories: [cat],
          difficulty,
          excludeVideoIds: used,
          maxVideoSec: 60
        });
        if (!p || p.source !== 'youtube-api') {
          console.warn('skip', cat, difficulty, n);
          continue;
        }
        used.push(p.mainVideo.youtubeId, p.impostorVideo.youtubeId);
        pairs.push({
          pairId: `${cat}_${difficulty}_${String(n + 1).padStart(2, '0')}`,
          category: cat,
          difficulty,
          label: p.label,
          mainVideo: {
            youtubeId: p.mainVideo.youtubeId,
            duration: p.mainVideo.duration
          },
          impostorVideo: {
            youtubeId: p.impostorVideo.youtubeId,
            duration: p.impostorVideo.duration
          }
        });
        console.log('ok', pairs[pairs.length - 1].pairId, p.mainVideo.youtubeId, p.impostorVideo.youtubeId);
        // petite pause pour éviter burst quota
        await new Promise((r) => setTimeout(r, 120));
      }
    }
  }

  if (pairs.length < 12) {
    console.error('Trop peu de paires:', pairs.length);
    process.exit(1);
  }

  const out = `/**
 * Banque WatchOut générée — ne pas y mettre des clips musicaux longs.
 * Régénérer: node scripts/build-watchout-bank.js
 */
module.exports = ${JSON.stringify(pairs, null, 2)};
`;
  const dest = path.join(__dirname, '..', 'games', 'watchout', 'video-pairs.js');
  fs.writeFileSync(dest, out);
  console.log('Wrote', pairs.length, 'pairs →', dest);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
