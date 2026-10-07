'use strict';

const { lexiconHas } = require('./themeLexicon');

const TIMEOUT_MS = 10000;
const MAX_CACHE = 5000;

/** @type {Map<string, { ok: boolean, reason?: string }>} */
const cache = new Map();

let lastAiError = null;

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

/** Nettoie la clé collée depuis le dashboard (espaces, guillemets, préfixe Bearer). */
function sanitizeApiKey(raw) {
  let k = String(raw || '').trim();
  if (
    (k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1).trim();
  }
  if (/^bearer\s+/i.test(k)) k = k.replace(/^bearer\s+/i, '').trim();
  return k;
}

/**
 * Priorité : Groq (gratuit) → OpenAI / autre endpoint compatible.
 * Groq : https://console.groq.com → API Keys
 */
function getApiConfig() {
  const groqKey = sanitizeApiKey(process.env.GROQ_API_KEY);
  if (groqKey) {
    return {
      provider: 'groq',
      apiKey: groqKey,
      baseUrl: (
        process.env.GROQ_BASE_URL ||
        process.env.OPENAI_BASE_URL ||
        'https://api.groq.com/openai/v1'
      ).replace(/\/$/, ''),
      model:
        process.env.GROQ_MODEL ||
        process.env.OPENAI_MODEL ||
        'openai/gpt-oss-20b'
    };
  }

  const apiKey = sanitizeApiKey(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
    /\/$/,
    ''
  );
  return {
    provider: 'openai',
    apiKey,
    baseUrl: base,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  };
}

function getThemeCheckStatus() {
  const cfg = getApiConfig();
  return {
    aiConfigured: Boolean(cfg),
    provider: cfg?.provider || null,
    model: cfg?.model || null,
    lastAiError
  };
}

function parseYesNo(text) {
  const t = String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!t) return null;
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

async function callOpenAIOnce(cfg, word, theme) {
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
        max_tokens: 16,
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
      let detail = '';
      try {
        const errBody = await res.json();
        detail = errBody?.error?.message || errBody?.error?.code || '';
      } catch {
        /* ignore */
      }
      const err = new Error(`api_${res.status}${detail ? `:${detail}` : ''}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const verdict = parseYesNo(content);
    if (verdict === true) return { ok: true };
    if (verdict === false) return { ok: false, reason: 'Hors thème.' };
    const err = new Error(`bad_verdict:${String(content || '').slice(0, 40)}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAI(cfg, word, theme) {
  try {
    return await callOpenAIOnce(cfg, word, theme);
  } catch (e) {
    // Un seul retry sur timeout / 429 / 5xx
    const status = e?.status;
    const aborted = e?.name === 'AbortError';
    const retryable =
      aborted || status === 429 || (typeof status === 'number' && status >= 500);
    if (!retryable) throw e;
    return callOpenAIOnce(cfg, word, theme);
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
      lastAiError = null;
      cacheSet(key, result);
      return result;
    } catch (e) {
      lastAiError =
        e?.name === 'AbortError'
          ? 'timeout'
          : String(e?.message || e).slice(0, 120);
      console.warn('[hot-potato] theme AI failed:', lastAiError);
      // Avec une clé IA : pas de secours lexique (évite les faux « Hors thème »).
      return {
        ok: false,
        reason:
          e?.name === 'AbortError'
            ? 'Vérif IA trop lente — réessaie.'
            : 'Vérif IA indisponible — réessaie.'
      };
    }
  }

  // Sans clé IA uniquement : lexique local
  const local = fromLexicon(w, themeLabel);
  cacheSet(key, local);
  return local;
}

module.exports = { isWordInTheme, getThemeCheckStatus };
