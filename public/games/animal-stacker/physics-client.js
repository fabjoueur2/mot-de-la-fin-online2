/** Physique client (Matter.js) — replay des chutes pour l'animation */
(function (global) {
  const Matter = global.Matter;
  if (!Matter) return;

  const { Engine, World, Bodies, Body, Composite } = Matter;

  const ANIMAL_TYPES = {
    bird: { width: 52, height: 36, chamfer: 6 },
    hedgehog: { width: 48, height: 32, chamfer: 10 },
    fox: { width: 58, height: 34, chamfer: 8 },
    penguin: { width: 40, height: 50, chamfer: 8 },
    frog: { width: 54, height: 38, chamfer: 12 },
    pig: { width: 50, height: 44, chamfer: 14 },
    rabbit: { width: 44, height: 52, chamfer: 8 },
    cat: { width: 48, height: 40, chamfer: 10 },
    sheep: { width: 56, height: 46, chamfer: 16 },
    owl: { width: 46, height: 48, chamfer: 10 },
    turtle: { width: 58, height: 36, chamfer: 12 },
    koala: { width: 50, height: 46, chamfer: 12 }
  };

  const DIFFICULTY_PRESETS = {
    facile: {
      gravity: 0.85,
      platformWidth: 285,
      sideMargin: 48,
      platformFriction: 0.95,
      platformRestitution: 0.03,
      bodyFriction: 0.92,
      bodyRestitution: 0.04
    },
    normal: {
      gravity: 1.15,
      platformWidth: 260,
      sideMargin: 35,
      platformFriction: 0.9,
      platformRestitution: 0.05,
      bodyFriction: 0.85,
      bodyRestitution: 0.08
    },
    corse: {
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
      width: 400,
      height: 420,
      platform: { x: 200, y: 368, width: cfg.platformWidth, height: 16 },
      dropY: 100,
      minX: 200 - half + margin,
      maxX: 200 + half - margin,
      fallY: 420,
      sideMargin: cfg.sideMargin,
      difficulty
    };
  }

  function getAnimalType(id) {
    return ANIMAL_TYPES[id] || ANIMAL_TYPES.bird;
  }

  function createPhysicsWorld(difficulty) {
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
    return { engine, animalBodies: [], worldCfg };
  }

  function createAnimalBody(typeId, x, y, angle, difficulty) {
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
      if (!isWorldMoving(engine) && i > 30) break;
    }
  }

  function isWorldMoving(engine) {
    return Composite.allBodies(engine.world).some(b => {
      if (b.isStatic) return false;
      return Math.abs(b.velocity.x) > 0.15
        || Math.abs(b.velocity.y) > 0.15
        || Math.abs(b.angularVelocity) > 0.05;
    });
  }

  function isBodyFallen(body, worldCfg) {
    const { x, width } = worldCfg.platform;
    const half = width / 2;
    if (body.position.y > worldCfg.fallY - 20) return true;
    if (body.position.x < x - half - worldCfg.sideMargin) return true;
    if (body.position.x > x + half + worldCfg.sideMargin) return true;
    return false;
  }

  function rebuildWorldFromStack(stack, difficulty) {
    const world = createPhysicsWorld(difficulty);
    for (const piece of stack) {
      const body = createAnimalBody(piece.type, piece.x, piece.y, piece.angle, difficulty);
      World.add(world.engine.world, body);
      world.animalBodies.push(body);
    }
    simulateUntilSettled(world.engine, 120);
    return world;
  }

  function createDropSimulation(stackBefore, typeId, x, angle, difficulty) {
    const worldCfg = getWorldForDifficulty(difficulty);
    const world = rebuildWorldFromStack(stackBefore || [], difficulty);
    const clampedX = Math.max(worldCfg.minX, Math.min(worldCfg.maxX, x));
    const dropped = createAnimalBody(typeId, clampedX, worldCfg.dropY, angle, difficulty);
    World.add(world.engine.world, dropped);
    world.animalBodies.push(dropped);
    world.droppedBody = dropped;
    return world;
  }

  function stepSimulation(world) {
    Engine.update(world.engine, 1000 / 60);
  }

  global.AnimalPhysics = {
    getWorldForDifficulty,
    createDropSimulation,
    stepSimulation,
    isWorldMoving,
    isBodyFallen
  };
})(typeof window !== 'undefined' ? window : global);
