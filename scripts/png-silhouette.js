const zlib = require('zlib');

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterScanline(filter, row, prev, bpp) {
  for (let i = 0; i < row.length; i++) {
    const left = i >= bpp ? row[i - bpp] : 0;
    const up = prev[i] || 0;
    const upLeft = i >= bpp ? prev[i - bpp] : 0;
    switch (filter) {
      case 0: break;
      case 1: row[i] = (row[i] + left) & 0xff; break;
      case 2: row[i] = (row[i] + up) & 0xff; break;
      case 3: row[i] = (row[i] + ((left + up) >> 1)) & 0xff; break;
      case 4: row[i] = (row[i] + paethPredictor(left, up, upLeft)) & 0xff; break;
      default: break;
    }
  }
}

function decodePngRgba(buffer) {
  if (buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('Fichier PNG invalide');
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer[25];
  if (colorType !== 6) {
    throw new Error(`PNG colorType ${colorType} non supporté (RGBA requis)`);
  }

  const bpp = 4;
  const idatParts = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') {
      idatParts.push(buffer.subarray(offset + 8, offset + 8 + length));
    }
    offset += 12 + length;
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatParts));
  const rgba = Buffer.alloc(width * height * bpp);
  let src = 0;
  let prev = Buffer.alloc(width * bpp);

  for (let y = 0; y < height; y++) {
    const filter = inflated[src++];
    const row = Buffer.from(inflated.subarray(src, src + width * bpp));
    src += width * bpp;
    unfilterScanline(filter, row, prev, bpp);
    row.copy(rgba, y * width * bpp);
    prev = row;
  }

  return { width, height, data: rgba };
}

function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function simplifyRdp(points, epsilon) {
  if (points.length <= 3) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy || 1;

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const t = ((p.x - start.x) * dx + (p.y - start.y) * dy) / len2;
    const proj = {
      x: start.x + t * dx,
      y: start.y + t * dy
    };
    const d = dist2(p, proj);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (Math.sqrt(maxDist) <= epsilon) {
    return [start, end];
  }

  const left = simplifyRdp(points.slice(0, maxIdx + 1), epsilon);
  const right = simplifyRdp(points.slice(maxIdx), epsilon);
  return left.slice(0, -1).concat(right);
}

function extractSilhouetteVertices(buffer, gameWidth, gameHeight, alphaThreshold = 48) {
  const { width, height, data } = decodePngRgba(buffer);
  const rowStep = Math.max(1, Math.floor(height / 36));
  const rows = [];

  for (let y = 0; y < height; y += rowStep) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] >= alphaThreshold) {
        if (left === -1) left = x;
        right = x;
      }
    }
    if (left >= 0) rows.push({ y, left, right });
  }

  if (rows.length < 4) return null;

  const leftSide = rows.map((r) => ({ x: r.left, y: r.y }));
  const rightSide = rows.map((r) => ({ x: r.right, y: r.y })).reverse();
  let poly = leftSide.concat(rightSide);

  poly = simplifyRdp(poly, 2.8);
  if (poly.length > 22) poly = simplifyRdp(poly, 4.5);
  if (poly.length > 18) poly = simplifyRdp(poly, 6);
  if (poly.length < 3) return null;

  const cx = width / 2;
  const cy = height / 2;
  const sx = gameWidth / width;
  const sy = gameHeight / height;

  return poly.map((p) => ({
    x: Math.round((p.x - cx) * sx * 10) / 10,
    y: Math.round((p.y - cy) * sy * 10) / 10
  }));
}

module.exports = {
  decodePngRgba,
  extractSilhouetteVertices
};
