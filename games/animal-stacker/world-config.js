/** Dimensions partagées de la zone de jeu Animal Stacker */
const BASE_WORLD = {
  width: 520,
  height: 580,
  platformX: 260,
  platformY: 500,
  platformHeight: 18,
  dropY: 85,
  fallY: 580,
  aimMargin: 32
};

const DIFFICULTY_PRESETS = {
  facile: {
    label: 'Facile',
    gravity: 0.85,
    platformWidth: 375,
    sideMargin: 55,
    platformFriction: 0.95,
    platformRestitution: 0.03,
    bodyFriction: 0.92,
    bodyRestitution: 0.04
  },
  normal: {
    label: 'Normal',
    gravity: 1.15,
    platformWidth: 340,
    sideMargin: 40,
    platformFriction: 0.9,
    platformRestitution: 0.05,
    bodyFriction: 0.85,
    bodyRestitution: 0.08
  },
  corse: {
    label: 'Corsé',
    gravity: 1.45,
    platformWidth: 280,
    sideMargin: 26,
    platformFriction: 0.78,
    platformRestitution: 0.1,
    bodyFriction: 0.72,
    bodyRestitution: 0.14
  }
};

const MAX_ANIMAL_DIM = 72;

function getDifficultyConfig(difficulty) {
  return DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.normal;
}

function getWorldForDifficulty(difficulty = 'normal') {
  const cfg = getDifficultyConfig(difficulty);
  const half = cfg.platformWidth / 2;
  const margin = BASE_WORLD.aimMargin;
  return {
    width: BASE_WORLD.width,
    height: BASE_WORLD.height,
    platform: {
      x: BASE_WORLD.platformX,
      y: BASE_WORLD.platformY,
      width: cfg.platformWidth,
      height: BASE_WORLD.platformHeight
    },
    dropY: BASE_WORLD.dropY,
    minX: BASE_WORLD.platformX - half + margin,
    maxX: BASE_WORLD.platformX + half - margin,
    fallY: BASE_WORLD.fallY,
    sideMargin: cfg.sideMargin,
    difficulty
  };
}

module.exports = {
  BASE_WORLD,
  DIFFICULTY_PRESETS,
  MAX_ANIMAL_DIM,
  getDifficultyConfig,
  getWorldForDifficulty
};
