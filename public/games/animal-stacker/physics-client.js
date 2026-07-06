/** Physique client (Matter.js) — replay des chutes pour l'animation */
(function (global) {
  const Matter = global.Matter;
  if (!Matter) return;

  const { Engine, World, Bodies, Body, Composite, Vertices, Vector, Common } = Matter;
  if (global.decomp) Common.setDecomp(global.decomp);
  const cfg = global.AS_WORLD_CONFIG || { BASE_WORLD: {}, DIFFICULTY_PRESETS: {} };
  const BASE = cfg.BASE_WORLD;

  function getDifficultyConfig(difficulty) {
    return cfg.DIFFICULTY_PRESETS[difficulty] || cfg.DIFFICULTY_PRESETS.normal;
  }

  function getWorldForDifficulty(difficulty = 'normal') {
    const preset = getDifficultyConfig(difficulty);
    const half = preset.platformWidth / 2;
    const margin = BASE.aimMargin || 32;
    return {
      width: BASE.width,
      height: BASE.height,
      platform: {
        x: BASE.platformX,
        y: BASE.platformY,
        width: preset.platformWidth,
        height: BASE.platformHeight
      },
      dropY: BASE.dropY,
      minX: BASE.platformX - half + margin,
      maxX: BASE.platformX + half - margin,
      fallY: BASE.fallY,
      sideMargin: preset.sideMargin,
      difficulty
    };
  }

  function getAnimalType(id) {
    if (global.getAnimalType) return global.getAnimalType(id);
    return { width: 72, height: 72, chamfer: 8, vertices: null };
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
    return { engine, animalBodies: [], worldCfg };
  }

  function createAnimalBody(typeId, x, y, angle, difficulty) {
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

  function isBodyLanded(body) {
    return Math.abs(body.velocity.y) < 0.45
      && Math.abs(body.velocity.x) < 0.45
      && Math.abs(body.angularVelocity) < 0.05;
  }

  function rebuildWorldFromStack(stack, difficulty, { settle = true } = {}) {
    const world = createPhysicsWorld(difficulty);
    for (const piece of stack || []) {
      const body = createAnimalBody(piece.type, piece.x, piece.y, piece.angle, difficulty);
      World.add(world.engine.world, body);
      world.animalBodies.push(body);
    }
    if (settle && stack && stack.length > 0) {
      simulateUntilSettled(world.engine, 120);
    }
    return world;
  }

  function createDropSimulation(stackBefore, typeId, x, angle, difficulty) {
    const worldCfg = getWorldForDifficulty(difficulty);
    const world = rebuildWorldFromStack(stackBefore || [], difficulty, { settle: false });
    const clampedX = Math.max(worldCfg.minX, Math.min(worldCfg.maxX, x));
    const dropped = createAnimalBody(typeId, clampedX, worldCfg.dropY, angle, difficulty);
    World.add(world.engine.world, dropped);
    world.animalBodies.push(dropped);
    world.droppedBody = dropped;
    return world;
  }

  function createWorldFromStack(stack, difficulty) {
    return rebuildWorldFromStack(stack || [], difficulty, { settle: false });
  }

  function stepSimulation(world) {
    Engine.update(world.engine, 1000 / 60);
  }

  global.AnimalPhysics = {
    getWorldForDifficulty,
    createDropSimulation,
    createWorldFromStack,
    stepSimulation,
    isWorldMoving,
    isBodyFallen,
    isBodyLanded
  };
})(typeof window !== 'undefined' ? window : global);
