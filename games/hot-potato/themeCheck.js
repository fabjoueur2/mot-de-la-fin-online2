'use strict';

const { lexiconHas } = require('./themeLexicon');

const TIMEOUT_MS = 4000;
const MAX_CACHE = 5000;

/** @type {Map<string, { ok: boolean, reason?: string }>} */
const cache = new Map();

function cacheKey(theme, word) {
  return `${String(theme).toLowerCase()}|${String(word).toLowerCase()}`;
}

function cacheSet(key, value) {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first != null) cache.delete(first);
  }
  cache.set(key, value);
}

function getApiConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
    /\/$/,
    ''
  );
  return {
    apiKey,
    baseUrl: base,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  };
}

function parseYesNo(text) {
  const t = String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/^(oui|yes|o|y|true|1)\b/.test(t)) return true;
  if (/^(non|no|n|false|0)\b/.test(t)) return false;
  if (/\boui\b/.test(t) || /\byes\b/.test(t)) return true;
  if (/\bnon\b/.test(t) || /\bno\b/.test(t)) return false;
  return null;
}

function fromLexicon(word, theme) {
  if (lexiconHas(theme, word)) return { ok: true };
  return { ok: false, reason: 'Hors thème.' };
}

async function callOpenAI(cfg, word, theme) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        max_tokens: 8,
        messages: [
          {
            role: 'system',
            content:
              'Tu juges si un mot français appartient clairement au thème donné (jeu de société). Réponds uniquement par oui ou non.'
          },
          {
            role: 'user',
            content: `Thème : ${theme}\nMot : ${word}\nLe mot appartient-il clairement à ce thème ?`
          }
        ]
      }),
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`api_${res.status}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const verdict = parseYesNo(content);
    if (verdict === true) return { ok: true };
    if (verdict === false) return { ok: false, reason: 'Hors thème.' };
    throw new Error('bad_verdict');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} word
 * @param {string} theme
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function isWordInTheme(word, theme) {
  const themeLabel = String(theme || '').trim();
  const w = String(word || '')
    .trim()
    .toLowerCase();
  if (!w || !themeLabel) {
    return { ok: false, reason: 'Mot ou thème manquant.' };
  }
  if (themeLabel.toLowerCase() === 'libre') {
    return { ok: true };
  }

  const key = cacheKey(themeLabel, w);
  if (cache.has(key)) return cache.get(key);

  const cfg = getApiConfig();
  if (cfg) {
    try {
      const result = await callOpenAI(cfg, w, themeLabel);
      cacheSet(key, result);
      return result;
    } catch {
      // API HS / lente → lexique local
      const fallback = fromLexicon(w, themeLabel);
      cacheSet(key, fallback);
      return fallback;
    }
  }

  const local = fromLexicon(w, themeLabel);
  cacheSet(key, local);
  return local;
}

module.exports = { isWordInTheme };
