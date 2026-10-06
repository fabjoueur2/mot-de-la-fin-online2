/**
 * Serveur local pour valider les assets Size It (bons / mauvais).
 *
 * Usage:
 *   npm run review-size-it-assets
 *   → http://127.0.0.1:4177
 *
 * Sauvegarde: games/size-it/bank/review.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BANK_DIR = path.join(ROOT, 'games', 'size-it', 'bank');
const REVIEW_FILE = path.join(BANK_DIR, 'review.json');
const UI_DIR = path.join(ROOT, 'tools', 'size-it-asset-review');
const PORT = Number(process.env.SIZE_IT_REVIEW_PORT || 4177);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function emptyReview() {
  return {
    schemaVersion: 1,
    updatedAt: null,
    verdicts: {}
  };
}

function loadReview() {
  if (!fs.existsSync(REVIEW_FILE)) return emptyReview();
  try {
    return JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8'));
  } catch {
    return emptyReview();
  }
}

function saveReview(data) {
  const out = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    verdicts: data.verdicts || {}
  };
  fs.writeFileSync(REVIEW_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  return out;
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    send(res, 404, 'Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  send(res, 200, fs.readFileSync(filePath), MIME[ext] || 'application/octet-stream');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = url.pathname;

  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      serveFile(res, path.join(UI_DIR, 'index.html'));
      return;
    }
    if (req.method === 'GET' && p === '/api/bank.json') {
      serveFile(res, path.join(BANK_DIR, 'bank.json'));
      return;
    }
    if (req.method === 'GET' && p === '/api/review.json') {
      send(res, 200, JSON.stringify(loadReview(), null, 2), MIME['.json']);
      return;
    }
    if (req.method === 'POST' && p === '/api/review.json') {
      const raw = await readBody(req);
      const data = JSON.parse(raw || '{}');
      if (!data || typeof data.verdicts !== 'object') {
        send(res, 400, JSON.stringify({ ok: false, error: 'verdicts required' }), MIME['.json']);
        return;
      }
      const saved = saveReview(data);
      const bad = Object.entries(saved.verdicts).filter(([, v]) => v.status === 'bad');
      const good = Object.entries(saved.verdicts).filter(([, v]) => v.status === 'good');
      console.log(
        `[review] saved — good ${good.length} · bad ${bad.length} · total marked ${Object.keys(saved.verdicts).length}`
      );
      send(res, 200, JSON.stringify({ ok: true, review: saved }), MIME['.json']);
      return;
    }
    if (req.method === 'GET' && p.startsWith('/assets/')) {
      // bank.json uses "assets/animals/foo.svg" → URL /assets/animals/foo.svg
      const rel = decodeURIComponent(p.replace(/^\/assets\//, ''));
      const filePath = path.normalize(path.join(BANK_DIR, 'assets', rel));
      if (!filePath.startsWith(path.join(BANK_DIR, 'assets'))) {
        send(res, 403, 'Forbidden');
        return;
      }
      serveFile(res, filePath);
      return;
    }
    if (req.method === 'GET' && p.startsWith('/ui/')) {
      serveFile(res, path.join(UI_DIR, p.slice(4)));
      return;
    }
    send(res, 404, 'Not found');
  } catch (e) {
    console.error(e);
    send(res, 500, JSON.stringify({ ok: false, error: String(e.message || e) }), MIME['.json']);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/`;
  console.log(`Size It asset review → ${url}`);
  console.log(`Sauvegarde auto → ${path.relative(ROOT, REVIEW_FILE)}`);
  console.log('Raccourcis: G = bon · B = mauvais · U = indécis · ←/→ = naviguer · S = sauver');
  const open =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(open, () => {});
});
