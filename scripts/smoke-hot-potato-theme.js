'use strict';

/**
 * Smoke test vérif thème Hot Potato (live Render + parseurs locaux).
 * Usage: node scripts/smoke-hot-potato-theme.js
 *        node scripts/smoke-hot-potato-theme.js https://mot-de-la-fin-online2.onrender.com
 */

const BASE =
  process.argv[2] ||
  process.env.SMOKE_BASE ||
  'https://mot-de-la-fin-online2.onrender.com';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON ${path}: ${text.slice(0, 120)}`);
  }
  return { status: res.status, data };
}

async function probe(word, theme) {
  const q = new URLSearchParams({
    probe: '1',
    word,
    theme
  });
  const { status, data } = await getJson(`/api/hot-potato/theme-check?${q}`);
  assert(status === 200, `HTTP ${status} pour ${word}/${theme}`);
  assert(data.aiConfigured === true, 'aiConfigured doit être true');
  assert(data.provider === 'groq', `provider=${data.provider}`);
  assert(!data.lastAiError, `lastAiError=${data.lastAiError}`);
  assert(data.probe && typeof data.probe.ok === 'boolean', 'probe manquant');
  return data.probe;
}

async function runLocalParserTests() {
  // Recharge le module sans clé → tests unitaires parse uniquement via require path
  const path = require('path');
  const themeCheckPath = path.join(__dirname, '..', 'games', 'hot-potato', 'themeCheck.js');
  delete require.cache[require.resolve(themeCheckPath)];
  // Accès indirect : on teste isWordInTheme Libre + lexique sans clé
  process.env.GROQ_API_KEY = '';
  process.env.OPENAI_API_KEY = '';
  delete require.cache[require.resolve(themeCheckPath)];
  const { isWordInTheme } = require(themeCheckPath);

  const libre = await isWordInTheme('anything', 'Libre');
  assert(libre.ok === true, 'Libre doit toujours accepter');

  const lexOk = await isWordInTheme('chien', 'Animaux');
  assert(lexOk.ok === true, 'lexique Animaux/chien');

  const lexNo = await isWordInTheme('ordinateur', 'Animaux');
  assert(lexNo.ok === false, 'lexique Animaux/ordinateur doit refuser');

  console.log('OK  local parsers + lexicon fallback (sans clé)');
}

async function main() {
  console.log('Base:', BASE);

  await runLocalParserTests();

  const { data: health } = await getJson('/api/health');
  assert(health.ok === true, 'health');
  console.log('OK  /api/health');

  const { data: status } = await getJson('/api/hot-potato/theme-check');
  assert(status.aiConfigured === true, 'status aiConfigured');
  assert(status.provider === 'groq', 'status provider groq');
  console.log('OK  status', status.model);

  const cases = [
    { word: 'bateau', theme: 'Bateaux', expect: true },
    { word: 'prune', theme: 'Couleurs', expect: true },
    { word: 'voilier', theme: 'Bateaux', expect: true },
    { word: 'ordinateur', theme: 'Bateaux', expect: false },
    { word: 'taffarel', theme: 'Bateaux', expect: false },
    { word: 'chien', theme: 'Animaux', expect: true },
    { word: 'pizza', theme: 'Animaux', expect: false }
  ];

  let failed = 0;
  for (const c of cases) {
    const probeRes = await probe(c.word, c.theme);
    const pass = probeRes.ok === c.expect;
    console.log(
      `${pass ? 'OK ' : 'FAIL'} IA ${c.word} / ${c.theme} → ${probeRes.ok} (attendu ${c.expect})` +
        (probeRes.reason ? ` [${probeRes.reason}]` : '')
    );
    if (!pass) failed += 1;
    // petit délai pour rester sous les rate limits Groq free
    await new Promise((r) => setTimeout(r, 400));
  }

  if (failed) {
    console.error(`\n${failed} cas IA en échec`);
    process.exit(1);
  }
  console.log('\nTous les tests sont verts.');
}

main().catch((e) => {
  console.error('SMOKE FAIL:', e.message || e);
  process.exit(1);
});
