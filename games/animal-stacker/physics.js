const Matter = require('matter-js');
const { getAnimalType } = require('./animals');

const { Engine, World, Bodies, Body, Composite } = Matter;

const BASE_WORLD = {
  width: 400,
  height: 420,
  platformY: 368,
  platformHeight: 16,
  platformX: 200,
  dropY: 100,
  fallY: 420
};

const DIFFICULTY_PRESETS = {
  facile: {
    label: 'Facile',
    gravity: 0.85,
    platformWidth: 285,
    sideMargin: 48,
    platformFriction: 0.95,
    platformRestitution: 0.03,
    bodyFriction: 0.92,
    bodyRestitution: 0.04
  },
  normal: {
    label: 'Normal',
    gravity: 1.15,
    platformWidth: 260,
    sideMargin: 35,
    platformFriction: 0.9,
    platformRestitution: 0.05,
    bodyFriction: 0.85,
    bodyRestitution: 0.08
  },
  corse: {
    label: 'Corsé',
    gravity: 1.45,
    platformWidth: 215,
    sideMargin: 22,
    platformFriction: 0.78,
    platformRestitution: 0.1,
    bodyFriction: 0.72,
    bodyRestitution: 0.14
  }
};

function getDifficultyConfig(difficulty) {
  return DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.normal;
}

function getWorldForDifficulty(difficulty = 'normal') {
  const cfg = getDifficultyConfig(difficulty);
  const half = cfg.platformWidth / 2;
  const margin = 25;
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

const WORLD = getWorldForDifficulty('normal');

function createPhysicsWorld(difficulty = 'normal') {
  const worldCfg = getWorldForDifficulty(difficulty);
  const physCfg = getDifficultyConfig(difficulty);
  const engine = Engine.create();
  engine.gravity.y = physCfg.gravity;

  const platform = Bodies.rectangle(
    worldCfg.platform.x,
    worldCfg.platform.y,
    worldCfg.platform.width,
    worldCfg.platform.height,
    {
      isStatic: true,
      friction: physCfg.platformFriction,
      restitution: physCfg.platformRestitution,
      label: 'platform',
      chamfer: { radius: 4 }
    }
  );

  const ground = Bodies.rectangle(200, 450, 500, 40, {
    isStatic: true,
    isSensor: true,
    label: 'void'
  });

  World.add(engine.world, [platform, ground]);
  return { engine, platform, animalBodies: [] };
}

function createAnimalBody(typeId, x, y, angle, difficulty = 'normal') {
  const def = getAnimalType(typeId);
  const physCfg = getDifficultyConfig(difficulty);
  const body = Bodies.rectangle(x, y, def.width, def.height, {
    chamfer: { radius: def.chamfer },
    friction: physCfg.bodyFriction,
    frictionStatic: Math.min(0.98, physCfg.bodyFriction + 0.05),
    restitution: physCfg.bodyRestitution,
    density: 0.002,
    label: typeId
  });
  Body.setAngle(body, angle);
  return body;
}

function simulateUntilSettled(engine, maxSteps = 400) {
  for (let i = 0; i < maxSteps; i++) {
    Engine.update(engine, 1000 / 60);
    const moving = Composite.allBodies(engine.world).some(b => {
      if (b.isStatic) return false;
      return Math.abs(b.velocity.x) > 0.15 || Math.abs(b.velocity.y) > 0.15 || Math.abs(b.angularVelocity) > 0.05;
    });
    if (!moving && i > 30) break;
  }
}

function isBodyFallen(body, worldCfg = WORLD) {
  const { x, width } = worldCfg.platform;
  const half = width / 2;
  if (body.position.y > worldCfg.fallY - 20) return true;
  if (body.position.x < x - half - worldCfg.sideMargin) return true;
  if (body.position.x > x + half + worldCfg.sideMargin) return true;
  return false;
}

function serializeStack(animalBodies) {
  return animalBodies.map((b, i) => ({
    id: i,
    type: b.label,
    x: Math.round(b.position.x * 10) / 10,
    y: Math.round(b.position.y * 10) / 10,
    angle: Math.round(b.angle * 1000) / 1000
  }));
}

function rebuildWorldFromStack(stack, difficulty = 'normal', { settle = true } = {}) {
  const worldCfg = getWorldForDifficulty(difficulty);
  const world = createPhysicsWorld(difficulty);
  for (const piece of stack) {
    const body = createAnimalBody(piece.type, piece.x, piece.y, piece.angle, difficulty);
    World.add(world.engine.world, body);
    world.animalBodies.push(body);
  }
  if (settle && stack.length > 0) {
    simulateUntilSettled(world.engine, 120);
  }
  world.worldCfg = worldCfg;
  return world;
}

function isBodyLanded(body) {
  return Math.abs(body.velocity.y) < 0.45
    && Math.abs(body.velocity.x) < 0.45
    && Math.abs(body.angularVelocity) < 0.05;
}

function stepWorld(world, steps = 1) {
  for (let i = 0; i < steps; i++) {
    Engine.update(world.engine, 1000 / 60);
  }
}

function syncStackFromWorld(world) {
  const worldCfg = world.worldCfg || WORLD;
  const alive = world.animalBodies.filter(b => !isBodyFallen(b, worldCfg));
  const fallen = world.animalBodies.filter(b => isBodyFallen(b, worldCfg));
  return {
    stack: serializeStack(alive),
    fallen,
    hasFallen: fallen.length > 0
  };
}

function dropAnimalOnWorld(world, typeId, x, angle, difficulty = 'normal') {
  const worldCfg = world.worldCfg || getWorldForDifficulty(difficulty);
  const clampedX = Math.max(worldCfg.minX, Math.min(worldCfg.maxX, x));
  const body = createAnimalBody(typeId, clampedX, worldCfg.dropY, angle, difficulty);
  World.add(world.engine.world, body);
  world.animalBodies.push(body);

  let fallen = false;
  for (let i = 0; i < 480; i++) {
    Engine.update(world.engine, 1000 / 60);
    if (world.animalBodies.some(b => isBodyFallen(b, worldCfg))) {
      fallen = true;
      break;
    }
    if (i > 24 && isBodyLanded(body)) break;
  }

  const sync = syncStackFromWorld(world);
  return {
    fallen: fallen || sync.hasFallen,
    fallenCount: sync.fallen.length,
    stack: sync.stack,
    world
  };
}

function dropAnimal(stack, typeId, x, angle, difficulty = 'normal') {
  const world = rebuildWorldFromStack(stack, difficulty);
  return dropAnimalOnWorld(world, typeId, x, angle, difficulty);
}

module.exports = {
  WORLD,
  BASE_WORLD,
  DIFFICULTY_PRESETS,
  getDifficultyConfig,
  getWorldForDifficulty,
  createPhysicsWorld,
  rebuildWorldFromStack,
  dropAnimal,
  dropAnimalOnWorld,
  stepWorld,
  syncStackFromWorld,
  serializeStack,
  isBodyFallen
};
