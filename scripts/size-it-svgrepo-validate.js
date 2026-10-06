/**
 * Détecte les appariements SVG Repo douteux (homonymes, sous-chaînes, symboles astrologiques…).
 */
'use strict';

const { SVGREPO_QUERY } = require('./size-it-source-queries');

function slug(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleWords(title) {
  return slug(title).split(/\s+/).filter(Boolean);
}

function wordInText(word, text) {
  if (!word || word.length < 2) return false;
  const re = new RegExp(`(?:^|[\\s_-])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[\\s_-]|$)`);
  return re.test(` ${text} `);
}

/** Titres SVG Repo clairement hors-sujet pour une banque « taille d’objet ». */
const TOXIC_TITLE =
  /horoscope|zodiac|astrology|defendant|bittrex|covid|infected|mental capacity|intellect|hot potato|christmas gift|snowflake party|ship window sea|kayak person|transmission chain|profit estimate|talk business|track dollar|set goals think|skin hair follicle|pepper and salt|icecream turck|business discussion|defendant|makeup|cosmetic palette/;

/** Titres d’une seule token clairement hors-sujet (pas « car » / « bus » utilisés à bon escient). */
const TOXIC_TITLE_EXACT = new Set([
  'id',
  'x',
  'eq',
  'hat',
  'mic',
  'vr',
  'pet',
  'eco',
  'itch',
  'key',
  'bell',
  'bow',
  'box',
  'hand',
  'ball',
  'surf',
  'arc',
  'opera',
  'archery'
]);

function termMatchesQuery(term, words, hay) {
  if (!term) return false;
  if (words.includes(term)) return true;
  if (term.length <= 4) return false;
  if (wordInText(term, hay)) return true;
  for (const w of words) {
    if (w.length >= 4 && (term.startsWith(w) || w.startsWith(term))) return true;
    if (term.endsWith('s') && term.slice(0, -1) === w) return true;
    if (w.endsWith('s') && w.slice(0, -1) === term) return true;
  }
  return false;
}

function queryTerms(entry, queryOverride) {
  const q = slug(queryOverride || SVGREPO_QUERY[entry.id] || entry.shape || entry.name);
  return q.split(/\s+/).filter((t) => t.length > 0);
}

function nameTerms(entry) {
  return slug(entry.name).split(/\s+/).filter((t) => t.length >= 4);
}

/**
 * Au moins un terme significatif de la requête ou du nom doit apparaître comme mot entier dans le titre.
 */
function termsCoveredByMatch(terms, matchTitle, extraNameTerms = []) {
  const words = titleWords(matchTitle);
  const hay = slug(matchTitle);
  const all = [...terms, ...extraNameTerms];
  if (all.length === 0) return true;

  for (const t of all) {
    if (termMatchesQuery(t, words, hay)) return true;
  }
  return false;
}

function isPlanetLike(entry) {
  if (entry.category !== 'space') return false;
  return /planet|mars|earth|moon|sun|jupiter|saturn|mercury|venus|neptune|uranus|asteroid|rings|galaxy|comet|iss|spacestation|hubble|rover|apollo/.test(
    slug(entry.shape)
  );
}

/**
 * @param {object} entry — catalogue { id, name, category, shape }
 * @param {string} query
 * @param {{ title: string, score?: number, url?: string }} match
 * @returns {{ ok: boolean, reasons: string[] }}
 */
function validateSvgRepoMatch(entry, query, match) {
  const reasons = [];
  const mt = match?.title || '';
  const mtSlug = slug(mt);
  const terms = queryTerms(entry, query);
  const url = String(match?.url || match?.sourceUrl || '');

  if (!mt) {
    reasons.push('empty_match_title');
    return { ok: false, reasons };
  }

  if (TOXIC_TITLE.test(mt) || TOXIC_TITLE.test(url)) {
    reasons.push('toxic_keyword');
  }

  const exact = mtSlug.trim();
  if (TOXIC_TITLE_EXACT.has(exact) && !terms.includes(exact) && !termMatchesQuery(exact, titleWords(mt), mtSlug)) {
    reasons.push('toxic_exact_title');
  }

  if (isPlanetLike(entry) && /horoscope|zodiac|astrology/.test(`${mtSlug} ${url}`)) {
    reasons.push('zodiac_not_planet');
  }

  if (entry.shape === 'pallet' || slug(entry.name).includes('palette eur')) {
    if (/paint|artist|art tray|makeup|cosmetic|color palette/.test(mtSlug)) {
      reasons.push('paint_palette');
    }
  }

  if (entry.shape === 'cargobike' || slug(entry.name).includes('velo cargo')) {
    if (exact === 'car' || (wordInText('car', mtSlug) && !/bike|bicycle|cycle|cargo bike/.test(mtSlug))) {
      reasons.push('car_not_cargo_bike');
    }
  }

  const score = match?.score ?? metaScore(entry, match);
  const weakMatch = score <= 38;

  // Sous-chaîne / requête trop loose (surtout scores bas)
  if (weakMatch && !termsCoveredByMatch(terms, mt, nameTerms(entry))) {
    reasons.push('query_terms_not_in_title');
  }

  // Homonymes véhicules : requête longue mais titre = seulement « car »
  if (
    terms.some((t) => t.length >= 6) &&
    exact === 'car' &&
    !terms.includes('car')
  ) {
    reasons.push('car_substring_vehicle');
  }

  if (exact === 'pin' && terms.some((t) => t.length >= 6) && !terms.includes('pin')) {
    reasons.push('pin_substring');
  }

  if (entry.category === 'animals' && exact === 'mouse' && terms.includes('hamster')) {
    reasons.push('mouse_not_hamster');
  }

  if (entry.category === 'animals' && exact === 'fish' && terms.includes('jellyfish')) {
    reasons.push('fish_not_jellyfish');
  }

  if (entry.category === 'nature' && slug(entry.name).includes('tournesol') && exact === 'sun') {
    reasons.push('sun_not_sunflower');
  }

  if (entry.category === 'nature' && slug(entry.name).includes('pomme de pin') && exact === 'pin') {
    reasons.push('pin_not_pinecone');
  }

  if (entry.category === 'nature' && slug(entry.name).includes('sequoia') && exact === 'eq') {
    reasons.push('eq_not_sequoia');
  }

  if (entry.category === 'nature' && slug(entry.name).includes('tronc') && /bag trunk/.test(mtSlug)) {
    reasons.push('luggage_not_tree_trunk');
  }

  if (entry.category === 'nature' && slug(entry.name).includes('rocher') && /rocket|astronaut/.test(mtSlug)) {
    reasons.push('rocket_not_rock');
  }

  if (entry.category === 'geography' && weakMatch && !termsCoveredByMatch(terms, mt, nameTerms(entry))) {
    reasons.push('geo_mismatch');
  }

  if (entry.category === 'landmarks' && /christmas gift/.test(mtSlug) && /christ|redempteur|redeemer/.test(slug(entry.name))) {
    reasons.push('gift_not_statue');
  }

  if (entry.category === 'landmarks' && exact === 'tree' && slug(entry.name).includes('skytree')) {
    reasons.push('tree_not_skytree');
  }

  if (entry.category === 'landmarks' && exact === 'pet' && slug(entry.name).includes('petronas')) {
    reasons.push('pet_not_petronas');
  }

  if (entry.category === 'landmarks' && exact === 'eiffel tower france world monument' && slug(entry.name).includes('londres')) {
    reasons.push('eiffel_not_london');
  }

  if (entry.category === 'sports' && exact === 'pin' && /ping|bowling|quille/.test(slug(entry.name + ' ' + entry.shape))) {
    reasons.push('pin_homonym');
  }

  if (entry.shape === 'rings' && /saturn|anneaux/.test(slug(entry.name)) && !/saturn|planet|solar/.test(mtSlug)) {
    reasons.push('jewelry_rings_not_saturn');
  }

  if (match?.score != null && match.score < 18) {
    reasons.push('low_score');
  }

  return { ok: reasons.length === 0, reasons };
}

function metaScore(entry, match) {
  return match?.score;
}

/**
 * @param {object} entry
 * @param {{ provider?: string, query?: string, matchTitle?: string, score?: number, sourceUrl?: string }} meta
 */
function validateStoredAsset(entry, meta) {
  if (!meta || meta.provider !== 'svgrepo') {
    return { ok: true, reasons: [] };
  }
  return validateSvgRepoMatch(entry, meta.query, {
    title: meta.matchTitle || '',
    score: meta.score,
    url: meta.sourceUrl
  });
}

module.exports = {
  slug,
  validateSvgRepoMatch,
  validateStoredAsset,
  termsCoveredByMatch,
  wordInText
};
