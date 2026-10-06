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

const { pickPair } = require('../games/watchout/youtube');

(async () => {
  console.log('API key present:', Boolean(process.env.YOUTUBE_API_KEY));
  const used = [];
  for (let i = 0; i < 5; i++) {
    const p = await pickPair({
      categories: ['animals'],
      difficulty: 'normal',
      excludeVideoIds: used,
      maxVideoSec: 60
    });
    if (!p) {
      console.log(i + 1, 'NULL');
      continue;
    }
    console.log(i + 1, {
      source: p.source,
      cat: p.category,
      main: p.mainVideo.youtubeId,
      imp: p.impostorVideo.youtubeId,
      label: p.label
    });
    used.push(p.mainVideo.youtubeId, p.impostorVideo.youtubeId);
  }

  console.log('--- food only ---');
  const p2 = await pickPair({
    categories: ['food'],
    difficulty: 'any',
    excludeVideoIds: [],
    maxVideoSec: 60
  });
  console.log(
    p2
      ? {
          source: p2.source,
          cat: p2.category,
          main: p2.mainVideo.youtubeId,
          imp: p2.impostorVideo.youtubeId
        }
      : null
  );
})().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
