const Matter = require('matter-js');
const decomp = require('poly-decomp');
const { getAnimalType } = require('./animals');
const { BASE_WORLD, getDifficultyConfig, getWorldForDifficulty } = require('./world-config');

Matter.Common.setDecomp(decomp);

const { Engine, World, Bodies, Body, Composite, Vertices, Vector, Sleeping } = Matter;

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

  const ground = Bodies.rectangle(
    worldCfg.platform.x,
    worldCfg.fallY + 40,
    worldCfg.width + 120,
    40,
    {
      isStatic: true,
      isSensor: true,
      label: 'void'
    }
  );

  World.add(engine.world, [platform, ground]);
  return { engine, platform, animalBodies: [] };
}

function createAnimalBody(typeId, x, y, angle, difficulty = 'normal') {
  const def = getAnimalType(typeId);
  const physCfg = getDifficultyConfig(difficulty);
  const bodyOpts = {
    friction: physCfg.bodyFriction,
    frictionStatic: Math.min(0.98, physCfg.bodyFriction + 0.05),
    restitution: physCfg.bodyRestitution,
    density: 0.002,
    label: typeId
  };

  let body;
  if (def.vertices && def.vertices.length >= 3) {
    const verts = def.vertices.map((v) => ({ x: v.x, y: v.y }));
    const centre = Vertices.centre(verts);
    const centered = Vertices.translate(verts, Vector.neg(centre));
    body = Bodies.fromVertices(x, y, [centered], bodyOpts, true);
  } else {
    body = Bodies.rectangle(x, y, def.width, def.height, {
      ...bodyOpts,
      chamfer: { radius: def.chamfer || 8 }
    });
  }

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
  if (!world || world.frozen) return;
  for (let i = 0; i < steps; i++) {
    Engine.update(world.engine, 1000 / 60);
  }
}

function freezeWorld(world) {
  if (!world || world.frozen) return null;
  for (const body of world.animalBodies) {
    Body.setVelocity(body, { x: 0, y: 0 });
    Body.setAngularVelocity(body, 0);
    Sleeping.set(body, true);
  }
  world.frozen = true;
  return syncStackFromWorld(world).stack;
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
  getDifficultyConfig,
  getWorldForDifficulty,
  createPhysicsWorld,
  rebuildWorldFromStack,
  dropAnimal,
  dropAnimalOnWorld,
  stepWorld,
  freezeWorld,
  syncStackFromWorld,
  serializeStack,
  isBodyFallen,
  createAnimalBody
};
