/** Rendu canvas — sprites FreePixel */
const spriteCache = new Map();
let spritesReady = false;
let spritesLoadPromise = null;

function getAnimalDef(type) {
  if (typeof window !== 'undefined' && window.getAnimalType) {
    return window.getAnimalType(type);
  }
  return null;
}

function loadSprite(url) {
  if (spriteCache.has(url)) return spriteCache.get(url);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  spriteCache.set(url, img);
  return img;
}

function preloadAnimalSprites() {
  if (spritesLoadPromise) return spritesLoadPromise;
  const list = window.ANIMAL_TYPES || [];
  if (!list.length) {
    spritesReady = true;
    return Promise.resolve();
  }
  spritesLoadPromise = Promise.all(list.map((animal) => new Promise((resolve) => {
    const img = loadSprite(animal.sprite);
    if (img.complete && img.naturalWidth > 0) {
      resolve();
      return;
    }
    img.onload = () => resolve();
    img.onerror = () => resolve();
  }))).then(() => {
    spritesReady = true;
  });
  return spritesLoadPromise;
}

function drawAnimal(ctx, type, x, y, angle, alpha = 1) {
  const def = getAnimalDef(type);
  if (!def) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);

  const img = loadSprite(def.sprite);
  if (img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -def.width / 2, -def.height / 2, def.width, def.height);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const r = def.chamfer || 8;
    if (ctx.roundRect) {
      ctx.roundRect(-def.width / 2, -def.height / 2, def.width, def.height, r);
    } else {
      ctx.rect(-def.width / 2, -def.height / 2, def.width, def.height);
    }
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}
