'use strict';

const ALL_CATEGORIES = [
  'daily_life',
  'food',
  'celebrities',
  'animals',
  'actions',
  'awkward',
  'abstract',
  'habits',
  'jobs',
  'tech',
  'events'
];

const CATEGORY_LABELS = {
  daily_life: 'Objets du quotidien',
  food: 'Nourriture & boissons',
  celebrities: 'Personnalités',
  animals: 'Animaux',
  actions: 'Actions',
  awkward: 'Situations gênantes',
  abstract: 'Concepts abstraits',
  habits: 'Habitudes',
  jobs: 'Métiers',
  tech: 'Technologies',
  events: 'Événements'
};

const DEFAULT_CONFIG = {
  roundCount: 5,
  itemsPerRound: 5,
  /** single_listeur = 1 listeur rotatif ; everyone_lists = tous classent, on devine une cible */
  playMode: 'single_listeur',
  timer: {
    enabled: false,
    personalRankingSeconds: 60,
    predictionSeconds: 60
  },
  categories: [...ALL_CATEGORIES],
  generationMode: 'balanced',
  absurdity: 'chaos',
  humorLevel: 'dark_light',
  allowCelebrities: true,
  allowAwkward: true,
  allowControversial: true,
  avoidRepeats: true,
  scoring: {
    correctPrediction: 1,
    /** Uniquement en mode everyone_lists (même rang perso vs cible) */
    matchingPosition: 2,
    perfectPredictionBonus: 0
  },
  reveal: {
    mode: 'manual',
    intervalSeconds: 6,
    order: 'listeur'
  },
  showScores: 'each_round',
  autoSubmitOnTimeout: true
};

const PRESETS = {
  detente: {
    label: 'Détente',
    config: {
      ...clone(DEFAULT_CONFIG),
      roundCount: 5,
      itemsPerRound: 5,
      timer: { enabled: false, personalRankingSeconds: 60, predictionSeconds: 60 },
      absurdity: 'medium',
      humorLevel: 'family',
      reveal: { mode: 'manual', intervalSeconds: 6, order: 'random' }
    }
  },
  classique: {
    label: 'Classique',
    config: {
      ...clone(DEFAULT_CONFIG),
      roundCount: 5,
      itemsPerRound: 5,
      timer: { enabled: true, personalRankingSeconds: 60, predictionSeconds: 60 },
      absurdity: 'high',
      humorLevel: 'quirky',
      reveal: { mode: 'manual', intervalSeconds: 6, order: 'random' }
    }
  },
  chaos: {
    label: 'Chaos',
    config: {
      ...clone(DEFAULT_CONFIG),
      roundCount: 8,
      itemsPerRound: 8,
      timer: { enabled: true, personalRankingSeconds: 30, predictionSeconds: 30 },
      absurdity: 'chaos',
      humorLevel: 'dark_light',
      allowControversial: true,
      reveal: { mode: 'automatic', intervalSeconds: 5, order: 'random' }
    }
  }
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function clampInt(n, min, max, fallback) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function sanitizeConfig(raw = {}) {
  const base = clone(DEFAULT_CONFIG);
  const c = raw && typeof raw === 'object' ? raw : {};

  if (c.roundCount === 'unlimited' || c.roundCount === 0) {
    base.roundCount = 'unlimited';
  } else if (c.roundCount != null) {
    base.roundCount = clampInt(c.roundCount, 1, 20, DEFAULT_CONFIG.roundCount);
  }

  if (c.itemsPerRound != null) {
    base.itemsPerRound = clampInt(c.itemsPerRound, 3, 10, DEFAULT_CONFIG.itemsPerRound);
  }

  if (['single_listeur', 'everyone_lists'].includes(c.playMode)) {
    base.playMode = c.playMode;
  }

  if (c.timer && typeof c.timer === 'object') {
    base.timer.enabled = Boolean(c.timer.enabled);
    base.timer.personalRankingSeconds = clampInt(
      c.timer.personalRankingSeconds,
      10,
      600,
      60
    );
    base.timer.predictionSeconds = clampInt(c.timer.predictionSeconds, 10, 600, 60);
  }

  if (Array.isArray(c.categories)) {
    const cats = c.categories.filter((x) => ALL_CATEGORIES.includes(x));
    if (cats.length) base.categories = [...new Set(cats)];
  }

  if (['random', 'balanced'].includes(c.generationMode)) {
    base.generationMode = c.generationMode;
  }
  if (['low', 'medium', 'high', 'chaos'].includes(c.absurdity)) {
    base.absurdity = c.absurdity;
  }
  if (['family', 'quirky', 'dark_light'].includes(c.humorLevel)) {
    base.humorLevel = c.humorLevel;
  }

  if (typeof c.allowCelebrities === 'boolean') base.allowCelebrities = c.allowCelebrities;
  if (typeof c.allowAwkward === 'boolean') base.allowAwkward = c.allowAwkward;
  if (typeof c.allowControversial === 'boolean') {
    base.allowControversial = c.allowControversial;
  }
  if (typeof c.avoidRepeats === 'boolean') base.avoidRepeats = c.avoidRepeats;

  if (c.scoring && typeof c.scoring === 'object') {
    for (const key of [
      'correctPrediction',
      'matchingPosition',
      'perfectPredictionBonus'
    ]) {
      if (c.scoring[key] != null) {
        base.scoring[key] = clampInt(c.scoring[key], 0, 20, base.scoring[key]);
      }
    }
  }

  if (c.reveal && typeof c.reveal === 'object') {
    if (['manual', 'automatic'].includes(c.reveal.mode)) {
      base.reveal.mode = c.reveal.mode;
    }
    if (c.reveal.intervalSeconds != null) {
      base.reveal.intervalSeconds = clampInt(c.reveal.intervalSeconds, 3, 15, 6);
    }
    if (['random', 'listeur'].includes(c.reveal.order)) {
      base.reveal.order = c.reveal.order;
    }
  }

  if (['each_round', 'end_only'].includes(c.showScores)) {
    base.showScores = c.showScores;
  }
  if (typeof c.autoSubmitOnTimeout === 'boolean') {
    base.autoSubmitOnTimeout = c.autoSubmitOnTimeout;
  }

  // Cohérence catégories / toggles
  if (!base.allowCelebrities) {
    base.categories = base.categories.filter((x) => x !== 'celebrities');
  }
  if (!base.allowAwkward) {
    base.categories = base.categories.filter((x) => x !== 'awkward');
  }
  if (!base.categories.length) {
    base.categories = ALL_CATEGORIES.filter((x) => {
      if (x === 'celebrities' && !base.allowCelebrities) return false;
      if (x === 'awkward' && !base.allowAwkward) return false;
      return true;
    });
  }

  return base;
}

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return sanitizeConfig(DEFAULT_CONFIG);
  return sanitizeConfig(p.config);
}

function configSummary(config) {
  const c = sanitizeConfig(config);
  const rounds =
    c.roundCount === 'unlimited' ? 'Manches illimitées' : `${c.roundCount} manches`;
  const timer = c.timer.enabled
    ? `Chrono ${c.timer.personalRankingSeconds}s / ${c.timer.predictionSeconds}s`
    : 'Sans chronomètre';
  const reveal =
    c.reveal.mode === 'automatic'
      ? `Révélations auto (${c.reveal.intervalSeconds}s)`
      : 'Révélations manuelles';
  const modeLabel =
    c.playMode === 'everyone_lists'
      ? 'Tout le monde liste · on devine une cible'
      : '1 listeur rotatif · les autres devinent';
  const lines = [
    rounds,
    `${c.itemsPerRound} éléments par manche`,
    modeLabel,
    timer,
    `Absurdité : ${c.absurdity}`,
    `Humour : ${c.humorLevel}`,
    `+${c.scoring.correctPrediction} par bonne prédiction`
  ];
  if (c.playMode === 'everyone_lists' && c.scoring.matchingPosition > 0) {
    lines.push(`+${c.scoring.matchingPosition} si même rang que la cible`);
  }
  if (c.scoring.perfectPredictionBonus > 0) {
    lines.push(`+${c.scoring.perfectPredictionBonus} bonus prédiction parfaite`);
  }
  lines.push(reveal);
  return lines;
}

module.exports = {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  DEFAULT_CONFIG,
  PRESETS,
  sanitizeConfig,
  applyPreset,
  configSummary,
  clone
};
