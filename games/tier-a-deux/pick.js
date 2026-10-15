'use strict';

const ITEMS = require('./items.json');
const { ALL_CATEGORIES } = require('./config');

const ABSURDITY_BANDS = {
  low: [1, 2],
  medium: [2, 3],
  high: [3, 4],
  chaos: [1, 5]
};

const HUMOR_ALLOWED = {
  family: ['family'],
  quirky: ['family', 'quirky'],
  dark_light: ['family', 'quirky', 'dark_light']
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function publicItem(item) {
  if (!item) return null;
  return {
    id: item.id,
    text: item.text,
    category: item.category
  };
}

function filterPool(config, usedIds) {
  const used = new Set(usedIds || []);
  const cats = new Set(config.categories || ALL_CATEGORIES);
  const [amin, amax] = ABSURDITY_BANDS[config.absurdity] || ABSURDITY_BANDS.chaos;
  const humors = new Set(HUMOR_ALLOWED[config.humorLevel] || HUMOR_ALLOWED.quirky);

  return ITEMS.filter((it) => {
    if (!it.enabled) return false;
    if (config.avoidRepeats && used.has(it.id)) return false;
    if (!cats.has(it.category)) return false;
    if (it.category === 'celebrities' && config.allowCelebrities === false) return false;
    if (it.category === 'awkward' && config.allowAwkward === false) return false;
    if (!config.allowControversial && (it.controversy || 0) >= 2) return false;
    if (it.absurdity < amin || it.absurdity > amax) return false;
    if (!humors.has(it.humorLevel || 'quirky')) return false;
    return true;
  });
}

function countAvailable(config, usedIds) {
  return filterPool(config, usedIds).length;
}

/**
 * Sélection contrastée : plusieurs catégories, mélange absurdité.
 */
function pickRoundItems(usedIds, config) {
  const n = Math.max(3, Math.min(10, config.itemsPerRound || 5));
  let pool = filterPool(config, usedIds);

  // Si trop peu (fin de banque), réautoriser les used
  if (pool.length < n) {
    pool = filterPool({ ...config, avoidRepeats: false }, []);
  }
  if (pool.length < n) {
    throw new Error(
      `Banque insuffisante : ${pool.length} éléments disponibles pour ${n} demandés.`
    );
  }

  const byCat = new Map();
  for (const it of pool) {
    if (!byCat.has(it.category)) byCat.set(it.category, []);
    byCat.get(it.category).push(it);
  }

  const categories = shuffle([...byCat.keys()]);
  const picked = [];
  const pickedIds = new Set();

  // 1) Une pièce par catégorie distincte tant que possible
  for (const cat of categories) {
    if (picked.length >= n) break;
    const list = shuffle(byCat.get(cat));
    const choice = list.find((x) => !pickedIds.has(x.id));
    if (choice) {
      picked.push(choice);
      pickedIds.add(choice.id);
    }
  }

  // 2) Compléter avec contraste d’absurdité
  const remaining = shuffle(pool.filter((x) => !pickedIds.has(x.id)));
  if (config.generationMode === 'balanced') {
    remaining.sort((a, b) => {
      const da = Math.abs((a.absurdity || 3) - 3);
      const db = Math.abs((b.absurdity || 3) - 3);
      // favoriser extrêmes + milieu mélangés : score aléatoire pondéré
      return (Math.random() - 0.5) * 2 + (db - da) * 0.1;
    });
  }

  for (const it of remaining) {
    if (picked.length >= n) break;
    // Éviter trop de similarité textuelle simple (mêmes 2 premiers mots)
    const prefix = it.text.split(/\s+/).slice(0, 2).join(' ').toLowerCase();
    const similar = picked.some(
      (p) => p.text.split(/\s+/).slice(0, 2).join(' ').toLowerCase() === prefix
    );
    if (similar && remaining.length > n - picked.length + 3) continue;
    picked.push(it);
    pickedIds.add(it.id);
  }

  // Si encore court, prendre sans filtre similarité
  if (picked.length < n) {
    for (const it of remaining) {
      if (picked.length >= n) break;
      if (pickedIds.has(it.id)) continue;
      picked.push(it);
      pickedIds.add(it.id);
    }
  }

  return shuffle(picked).slice(0, n).map(publicItem);
}

function getItemById(id) {
  return ITEMS.find((x) => x.id === id) || null;
}

function itemsByIds(ids) {
  return (ids || []).map((id) => publicItem(getItemById(id))).filter(Boolean);
}

module.exports = {
  ITEMS,
  publicItem,
  filterPool,
  countAvailable,
  pickRoundItems,
  getItemById,
  itemsByIds
};
