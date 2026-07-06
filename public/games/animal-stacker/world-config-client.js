window.AS_WORLD_CONFIG = {
  BASE_WORLD: {
    width: 520,
    height: 580,
    platformX: 260,
    platformY: 500,
    platformHeight: 18,
    dropY: 85,
    fallY: 580,
    aimMargin: 32
  },
  DIFFICULTY_PRESETS: {
    facile: {
      gravity: 0.85,
      platformWidth: 375,
      sideMargin: 55,
      platformFriction: 0.95,
      platformRestitution: 0.03,
      bodyFriction: 0.92,
      bodyRestitution: 0.04
    },
    normal: {
      gravity: 1.15,
      platformWidth: 340,
      sideMargin: 40,
      platformFriction: 0.9,
      platformRestitution: 0.05,
      bodyFriction: 0.85,
      bodyRestitution: 0.08
    },
    corse: {
      gravity: 1.45,
      platformWidth: 280,
      sideMargin: 26,
      platformFriction: 0.78,
      platformRestitution: 0.1,
      bodyFriction: 0.72,
      bodyRestitution: 0.14
    }
  }
};
