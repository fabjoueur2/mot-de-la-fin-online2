const GAME_ID = 'size-it';
const GAME_PATH = '/games/size-it/';
const socket = io({ transports: ['websocket', 'polling'] });

let state = null;
let timerAnimId = null;
let smoothTimer = { endsAt: null, durationMs: 20000, frozenPct: 100, running: false };
let estimateM = null;
let lastPuzzleId = null;
let lastTimesUpAt = 0;

/** Vue canvas : zoom + position de l'objet à estimer (%, depuis la gauche / depuis le sol). */
let viewZoom = 1;
let estPos = { xPct: 58, yPx: 0 }; // yPx = offset au-dessus du sol
let dragMode = null; // 'move' | 'resize' | null
let dragStart = null;

const REF_TARGET_PX = 88; // hauteur cible de la référence à zoom=1
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const FLOOR_PAD = 30; // doit matcher CSS bottom du sol + un peu

const DIMENSION_LABELS = {
  projected_width: 'largeur projetée',
  long_side: 'grand côté',
  length: 'longueur',
  height: 'hauteur',
  diameter: 'diamètre',
  width: 'largeur',
  short_side: 'petit côté'
};

const $ = (id) => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
  const inRoom = id !== 'screen-home';
  const inLobby = id === 'screen-lobby';
  $('room-nav').style.display = inRoom ? 'flex' : 'none';
  $('btn-salon').style.display = inRoom && !inLobby ? 'block' : 'none';
}

function showToast(msg) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function getPlayerName() {
  return ($('player-name').value || 'Joueur').trim().slice(0, 20) || 'Joueur';
}

function leaveToMenu() {
  stopSmoothTimer();
  socket.emit('leave-room');
  state = null;
  window.location.href = '/';
}

function backToSalon() {
  if (!state?.isHost) {
    showToast('Seul l\'hôte peut ramener au salon.');
    return;
  }
  socket.emit('si-back-to-lobby');
}

function selectedCategories() {
  return [...document.querySelectorAll('#cat-toggles input:checked')].map((el) => el.value);
}

function pushSettings() {
  if (!state?.isHost) return;
  socket.emit('si-update-settings', {
    roundCount: parseInt($('set-rounds').value, 10),
    estimateSec: parseInt($('set-estimate-sec').value, 10),
    categories: selectedCategories()
  });
}

function formatMmSs(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function timerFillColor(pct) {
  const t = 1 - Math.max(0, Math.min(100, pct)) / 100;
  const stops = [[0, [107, 203, 119]], [0.5, [255, 217, 61]], [1, [255, 107, 107]]];
  let from = stops[0];
  let to = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      from = stops[i];
      to = stops[i + 1];
      break;
    }
  }
  const span = to[0] - from[0] || 1;
  const u = (t - from[0]) / span;
  const rgb = from[1].map((c, i) => Math.round(c + (to[1][i] - c) * u));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function applyTimerFill(pct) {
  const fill = $('si-timer-fill');
  if (!fill) return;
  const safe = Math.max(0, Math.min(100, pct));
  fill.style.width = `${safe}%`;
  fill.style.backgroundColor = timerFillColor(safe);
}

function updateTimerDisplay(leftMs) {
  const el = $('game-timer');
  if (!el) return;
  el.textContent = formatMmSs(leftMs);
  el.classList.toggle('warning', leftMs > 0 && leftMs <= 10000);
  el.classList.toggle('danger', leftMs <= 5000);
}

function stopSmoothTimer() {
  if (timerAnimId) {
    cancelAnimationFrame(timerAnimId);
    timerAnimId = null;
  }
  smoothTimer.running = false;
}

function tickSmoothTimer() {
  timerAnimId = null;
  if (!smoothTimer.running) return;
  let leftMs = 0;
  let pct = smoothTimer.frozenPct;
  if (smoothTimer.endsAt != null && smoothTimer.durationMs > 0) {
    leftMs = Math.max(0, smoothTimer.endsAt - Date.now());
    pct = (leftMs / smoothTimer.durationMs) * 100;
  }
  applyTimerFill(pct);
  updateTimerDisplay(leftMs);
  if (smoothTimer.endsAt != null && leftMs > 0) {
    timerAnimId = requestAnimationFrame(tickSmoothTimer);
  } else {
    smoothTimer.running = false;
    requestTimesUp();
  }
}

function requestTimesUp() {
  if (!state || state.phase !== 'estimate') return;
  const now = Date.now();
  if (now - lastTimesUpAt < 800) return;
  lastTimesUpAt = now;
  socket.emit('si-times-up');
}

function syncSmoothTimer(s) {
  const durationSec = s.settings?.estimateSec || 20;
  smoothTimer.durationMs = durationSec * 1000;
  stopSmoothTimer();
  if (s.phase !== 'estimate') {
    applyTimerFill(0);
    updateTimerDisplay(0);
    return;
  }
  const leftMs = typeof s.estimateRemainingMs === 'number'
    ? Math.max(0, s.estimateRemainingMs)
    : 0;
  smoothTimer.endsAt = Date.now() + leftMs;
  smoothTimer.frozenPct = smoothTimer.durationMs ? (leftMs / smoothTimer.durationMs) * 100 : 0;
  smoothTimer.running = leftMs > 0;
  applyTimerFill(smoothTimer.frozenPct);
  updateTimerDisplay(leftMs);
  if (smoothTimer.running) {
    tickSmoothTimer();
  } else {
    requestTimesUp();
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSize(value, unit) {
  const u = String(unit || 'm').toLowerCase();
  const v = Number(value);
  if (!Number.isFinite(v)) return '—';
  const digits = u === 'km' ? (v >= 100 ? 0 : 1) : (v >= 100 ? 0 : v >= 10 ? 1 : 2);
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: digits })} ${u}`;
}

function metersToNative(m, unit) {
  const u = String(unit || 'm').toLowerCase();
  if (u === 'mm') return m * 1000;
  if (u === 'cm') return m * 100;
  if (u === 'km') return m / 1000;
  return m;
}

function categoryLabel(cat) {
  return ({
    animals: 'Animaux',
    everyday: 'Quotidien',
    vehicles: 'Véhicules',
    sports: 'Sport',
    landmarks: 'Monuments',
    food: 'Nourriture',
    geography: 'Géographie',
    space: 'Espace',
    nature: 'Nature',
    standard_object: 'Objet'
  })[cat] || cat;
}

function dimensionLabel(dim, fallback) {
  if (fallback) return fallback;
  return DIMENSION_LABELS[dim] || String(dim || 'taille').replace(/_/g, ' ');
}

function renderScores(listEl, players) {
  if (!listEl) return;
  const sorted = [...(players || [])].sort((a, b) => (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name));
  listEl.innerHTML = sorted.map((p, i) => {
    const badges = [
      p.isHost ? '<span class="qdm-badge">Hôte</span>' : '',
      p.id === state?.myId ? '<span class="qdm-badge qdm-badge-me">Vous</span>' : '',
      p.locked ? '<span class="qdm-badge">🔒</span>' : ''
    ].filter(Boolean).join(' ');
    return `<li><span class="qdm-rank">${i + 1}.</span> <strong>${escapeHtml(p.name)}</strong> ${badges}<span class="qdm-score">${p.score || 0} pts</span></li>`;
  }).join('');
}

function pxPerMeter() {
  const refM = Math.max(1e-9, state?.reference?.sizeM || 1);
  return (REF_TARGET_PX / refM) * viewZoom;
}

function clampEstimate(m) {
  const ref = state?.reference?.sizeM || 1;
  const min = ref * 0.01;
  const max = ref * 80;
  return Math.max(min, Math.min(max, m));
}

function updateEstLabel() {
  const unit = state?.puzzle?.unit || 'm';
  const native = metersToNative(estimateM, unit);
  const el = $('est-value');
  if (el) el.textContent = formatSize(native, unit);
}

function emitEstimate() {
  if (!Number.isFinite(estimateM) || estimateM <= 0) return;
  socket.emit('si-update-estimate', { valueM: estimateM });
}

function layoutCanvas() {
  const s = state;
  if (!s?.reference || !s?.puzzle) return;
  const ppm = pxPerMeter();
  const refH = Math.max(16, s.reference.sizeM * ppm);
  const estH = Math.max(16, (estimateM || s.reference.sizeM) * ppm);

  const refSil = $('ref-sil');
  const estSil = $('est-sil');
  const refObj = $('ref-obj');
  const estObj = $('est-obj');

  if (refSil) {
    refSil.style.height = `${refH}px`;
    refSil.style.width = 'auto';
  }
  if (estSil) {
    estSil.style.height = `${estH}px`;
    estSil.style.width = 'auto';
  }
  if (refObj) {
    refObj.style.left = '18%';
    refObj.style.bottom = `${FLOOR_PAD}px`;
  }
  if (estObj) {
    estObj.style.left = `${estPos.xPct}%`;
    estObj.style.bottom = `${FLOOR_PAD + Math.max(0, estPos.yPx)}px`;
  }
  updateEstLabel();
}

function initEstimateStage(s) {
  const puzzle = s.puzzle;
  const ref = s.reference;
  if (!puzzle || !ref) return;

  $('puzzle-cat').textContent = categoryLabel(puzzle.category);
  $('puzzle-name').textContent = puzzle.name;
  const dimTxt = dimensionLabel(puzzle.dimension, puzzle.dimensionLabel);
  $('puzzle-dim').textContent =
    `Estime : ${dimTxt} · Réf. ${ref.label} (${formatSize(metersToNative(ref.sizeM, puzzle.unit), puzzle.unit)})`;
  $('ref-label').textContent = ref.label;

  const hud = $('si-hud-line');
  if (hud) {
    hud.textContent = `ROUND ${s.currentRound} / ${s.roundCount} · SCORE ${s.myScore || 0}`;
  }

  const refSil = $('ref-sil');
  const estSil = $('est-sil');
  const refUrl = ref.svgUrl || '';
  if (refSil && refUrl && refSil.getAttribute('src') !== refUrl) {
    refSil.src = refUrl;
  }

  if (puzzle.id !== lastPuzzleId) {
    lastPuzzleId = puzzle.id;
    lastTimesUpAt = 0;
    viewZoom = 1;
    estPos = { xPct: 58, yPx: 0 };
    if (estSil) estSil.src = puzzle.svgUrl;
    estimateM = s.myEstimateM && s.myEstimateM > 0 ? s.myEstimateM : ref.sizeM;
  } else if (s.myEstimateM && s.myEstimateM > 0 && !dragMode) {
    estimateM = s.myEstimateM;
  }

  layoutCanvas();

  const locked = Boolean(s.myLocked);
  $('btn-lock').disabled = locked;
  $('btn-lock').textContent = locked ? '🔒 Verrouillé' : '🔒 Verrouiller';
  $('si-canvas')?.classList.toggle('si-locked', locked);

  $('lock-list').innerHTML = (s.locks || []).map((p) =>
    `<li><strong>${escapeHtml(p.name)}</strong> ${p.locked ? '🔒' : '…'}</li>`
  ).join('');
}

function renderReveal(s) {
  const puzzle = s.puzzle;
  const ref = s.reference;
  const results = s.roundResults || [];
  if (!puzzle) return;

  $('reveal-truth').textContent =
    `Réalité : ${formatSize(puzzle.trueSize, puzzle.unit)} · ${puzzle.name}`;

  const trueM = puzzle.trueSizeM;
  const values = [trueM, ...results.map((r) => r.estimateM)].filter((v) => v > 0);
  const maxM = Math.max(...values, ref?.sizeM || 0);
  const stageH = 280;
  const pxPerM = stageH / maxM;

  const stage = $('reveal-stage');
  const colors = ['#4d96ff', '#ff6b6b', '#ffd93d', '#c77dff', '#ff9f43', '#00cec9', '#fd79a8'];
  const bars = [];

  bars.push(`
    <div class="si-reveal-col">
      <div class="si-reveal-bar si-reveal-truth" style="height:${Math.max(12, trueM * pxPerM)}px"></div>
      <div class="si-reveal-name">Réalité</div>
      <div class="si-reveal-size">${formatSize(puzzle.trueSize, puzzle.unit)}</div>
    </div>
  `);

  results
    .slice()
    .sort((a, b) => b.total - a.total)
    .forEach((r, i) => {
      const h = Math.max(12, r.estimateM * pxPerM);
      bars.push(`
        <div class="si-reveal-col">
          <div class="si-reveal-bar" style="height:${h}px;background:${colors[i % colors.length]}"></div>
          <div class="si-reveal-name">${escapeHtml(r.name)}${r.perfect ? ' 🎯' : ''}${r.closest ? ' 👑' : ''}</div>
          <div class="si-reveal-size">${formatSize(r.estimateNative, puzzle.unit)} · ${r.total} pts</div>
        </div>
      `);
    });

  stage.innerHTML = bars.join('');

  const medals = ['🥇', '🥈', '🥉'];
  const ordered = results.slice().sort((a, b) => b.total - a.total);
  $('reveal-scores').innerHTML = ordered.map((r, i) => {
    const medal = medals[i] || `${i + 1}.`;
    const extras = [
      r.perfect ? 'Perfect +10' : '',
      r.closest ? 'Closest +5' : ''
    ].filter(Boolean).join(' · ');
    return `<li>${medal} <strong>${escapeHtml(r.name)}</strong> — ${r.total} pts <span class="share-hint">${extras}</span></li>`;
  }).join('');

  $('btn-next-round').style.display = s.isHost ? 'block' : 'none';
  $('reveal-auto-hint').textContent = s.isHost
    ? 'Prochaine manche auto dans quelques secondes, ou cliquez.'
    : 'Prochaine manche automatique…';
}

function renderLobby(s) {
  $('lobby-code').textContent = s.code;
  $('lobby-player-count').textContent = `(${s.players.length})`;
  $('lobby-min-hint').textContent = `Minimum ${s.minPlayers || 2} joueurs.`;
  renderScores($('lobby-players'), s.players);

  if (s.isHost) {
    $('host-settings').style.display = 'block';
    $('guest-wait').style.display = 'none';
    $('set-rounds').value = String(s.settings.roundCount);
    $('set-estimate-sec').value = String(s.settings.estimateSec);
    document.querySelectorAll('#cat-toggles input').forEach((el) => {
      el.checked = (s.settings.categories || []).includes(el.value);
    });
    $('btn-start-game').disabled = s.players.length < (s.minPlayers || 2);
  } else {
    $('host-settings').style.display = 'none';
    $('guest-wait').style.display = 'block';
  }
}

function renderGame(s) {
  $('game-round').textContent = `Manche ${s.currentRound} / ${s.roundCount}`;
  syncSmoothTimer(s);

  const estimating = s.phase === 'estimate';
  $('panel-estimate').style.display = estimating ? 'block' : 'none';
  $('panel-reveal').style.display = s.phase === 'reveal' ? 'block' : 'none';

  if (estimating) initEstimateStage(s);
  if (s.phase === 'reveal') renderReveal(s);
}

function renderEnd(s) {
  const top = s.ranking?.[0];
  const leaders = (s.ranking || []).filter((p) => p.score === (top?.score || 0));
  $('end-title').textContent = leaders.length > 1
    ? `Égalité : ${leaders.map((p) => p.name).join(', ')}`
    : `${top?.name || 'Gagnant'} gagne !`;
  $('end-subtitle').textContent = `${s.roundCount} manches · ${s.players.length} joueurs`;
  renderScores($('final-scores'), s.ranking || s.players);
  $('btn-rematch').style.display = s.isHost ? 'inline-flex' : 'none';
  $('btn-end-lobby').style.display = s.isHost ? 'inline-flex' : 'none';
}

function applyState(s) {
  state = s;
  if (!s) {
    stopSmoothTimer();
    return;
  }
  if (s.phase === 'lobby') {
    stopSmoothTimer();
    lastPuzzleId = null;
    showScreen('screen-lobby');
    renderLobby(s);
  } else if (s.phase === 'estimate' || s.phase === 'reveal') {
    showScreen('screen-game');
    renderGame(s);
  } else if (s.phase === 'end') {
    stopSmoothTimer();
    showScreen('screen-end');
    renderEnd(s);
  }
}

/* —— Canvas : move / resize / zoom —— */
function pointerXY(e) {
  if (e.touches && e.touches[0]) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  if (e.changedTouches && e.changedTouches[0]) {
    return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

function resizeDistFromAnchor(clientX, clientY) {
  const sil = $('est-sil');
  if (!sil) return 1;
  const rect = sil.getBoundingClientRect();
  const ax = rect.left;
  const ay = rect.bottom;
  return Math.max(12, Math.hypot(clientX - ax, ay - clientY));
}

function onPointerDown(e) {
  if (!state || state.phase !== 'estimate' || state.myLocked) return;
  const target = e.target;
  const handle = $('est-handle');
  const estObj = $('est-obj');
  const isHandle = target === handle || handle?.contains(target);
  const isEst = target === estObj || estObj?.contains(target);
  if (!isHandle && !isEst) return;

  const { x, y } = pointerXY(e);
  if (isHandle) {
    dragMode = 'resize';
    dragStart = {
      x,
      y,
      estimateM,
      dist: resizeDistFromAnchor(x, y)
    };
  } else {
    dragMode = 'move';
    estObj?.classList.add('si-dragging');
    dragStart = {
      x,
      y,
      xPct: estPos.xPct,
      yPx: estPos.yPx,
      canvasW: $('si-canvas')?.clientWidth || 1
    };
  }
  e.preventDefault();
}

function onPointerMove(e) {
  if (!dragMode || !dragStart) return;
  const { x, y } = pointerXY(e);
  if (dragMode === 'move') {
    const dx = x - dragStart.x;
    const dy = dragStart.y - y;
    const w = dragStart.canvasW || 1;
    estPos.xPct = Math.max(8, Math.min(92, dragStart.xPct + (dx / w) * 100));
    estPos.yPx = Math.max(0, Math.min(220, dragStart.yPx + dy));
    layoutCanvas();
  } else if (dragMode === 'resize') {
    const dist = resizeDistFromAnchor(x, y);
    const ratio = dist / Math.max(12, dragStart.dist);
    estimateM = clampEstimate(dragStart.estimateM * ratio);
    layoutCanvas();
    emitEstimate();
  }
  e.preventDefault();
}

function onPointerUp() {
  if (dragMode === 'resize') emitEstimate();
  dragMode = null;
  dragStart = null;
  $('est-obj')?.classList.remove('si-dragging');
}

function setZoom(next) {
  viewZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
  layoutCanvas();
}

document.addEventListener('mousemove', onPointerMove);
document.addEventListener('mouseup', onPointerUp);
document.addEventListener('touchmove', onPointerMove, { passive: false });
document.addEventListener('touchend', onPointerUp);

$('est-handle')?.addEventListener('mousedown', onPointerDown);
$('est-obj')?.addEventListener('mousedown', onPointerDown);
$('est-handle')?.addEventListener('touchstart', onPointerDown, { passive: false });
$('est-obj')?.addEventListener('touchstart', onPointerDown, { passive: false });

$('si-canvas')?.addEventListener('wheel', (e) => {
  if (!state || state.phase !== 'estimate' || state.myLocked) return;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    setZoom(viewZoom * (e.deltaY > 0 ? 0.9 : 1.1));
    return;
  }
  const factor = e.deltaY > 0 ? 0.92 : 1.08;
  estimateM = clampEstimate((estimateM || state.reference.sizeM) * factor);
  layoutCanvas();
  emitEstimate();
}, { passive: false });

$('btn-zoom-in')?.addEventListener('click', () => setZoom(viewZoom * 1.25));
$('btn-zoom-out')?.addEventListener('click', () => setZoom(viewZoom / 1.25));

socket.on('connect', () => {
  $('connection-status').textContent = '● Connecté';
  $('connection-status').classList.remove('offline');
});
socket.on('disconnect', () => {
  $('connection-status').textContent = '● Déconnecté — reconnexion…';
  $('connection-status').classList.add('offline');
});
socket.on('room-state', applyState);
socket.on('left-room', () => { state = null; window.location.href = '/'; });
socket.on('error-msg', (msg) => showToast(msg));

$('btn-show-join').addEventListener('click', () => { $('join-panel').style.display = 'block'; });
$('btn-create').addEventListener('click', () => {
  socket.emit('create-room', { playerName: getPlayerName(), gameId: GAME_ID });
});
$('btn-join').addEventListener('click', () => {
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length < 4) return showToast('Code invalide');
  socket.emit('join-room', { code, playerName: getPlayerName(), gameId: GAME_ID });
});
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join').click(); });

$('btn-copy-code').addEventListener('click', async () => {
  if (!state?.code) return;
  await navigator.clipboard.writeText(state.code);
  showToast('Code copié !');
});
$('btn-copy-link').addEventListener('click', async () => {
  if (!state?.code) return;
  await navigator.clipboard.writeText(`${location.origin}${GAME_PATH}?room=${state.code}`);
  showToast('Lien copié !');
});

$('btn-menu').addEventListener('click', leaveToMenu);
$('btn-salon').addEventListener('click', backToSalon);
$('btn-replay-menu').addEventListener('click', leaveToMenu);

$('set-rounds').addEventListener('change', pushSettings);
$('set-estimate-sec').addEventListener('change', pushSettings);
document.querySelectorAll('#cat-toggles input').forEach((el) => {
  el.addEventListener('change', pushSettings);
});

$('btn-start-game').addEventListener('click', () => {
  pushSettings();
  socket.emit('si-start-game');
});

$('btn-lock').addEventListener('click', () => {
  if (!state || state.phase !== 'estimate') return;
  if (state.myLocked) return;
  const valueM = Number(estimateM);
  if (!Number.isFinite(valueM) || valueM <= 0) {
    showToast('Ajuste d\'abord la silhouette');
    return;
  }
  $('btn-lock').disabled = true;
  $('btn-lock').textContent = '🔒 Verrouillage…';
  socket.emit('si-lock', { valueM });
});

$('btn-next-round').addEventListener('click', () => socket.emit('si-next-round'));
$('btn-rematch').addEventListener('click', () => socket.emit('si-rematch'));
$('btn-end-lobby').addEventListener('click', () => socket.emit('si-back-to-lobby'));

const roomFromUrl = new URLSearchParams(location.search).get('room');
if (roomFromUrl) {
  $('join-code').value = roomFromUrl.toUpperCase();
  $('join-panel').style.display = 'block';
}
