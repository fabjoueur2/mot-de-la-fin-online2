const GAME_ID = 'size-it';
const GAME_PATH = '/games/size-it/';
const socket = io({ transports: ['websocket', 'polling'] });

let state = null;
let timerAnimId = null;
let smoothTimer = { endsAt: null, durationMs: 20000, frozenPct: 100, running: false };
let estimateM = null;
let dragging = false;
let lastPuzzleId = null;

const STAGE_H = 280; // px usable for tallest silhouette
const REF_FRAC = 0.42; // reference height fraction of stage when object >> ref

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
  if (smoothTimer.endsAt != null && pct > 0) {
    timerAnimId = requestAnimationFrame(tickSmoothTimer);
  } else {
    smoothTimer.running = false;
  }
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
  if (smoothTimer.running) tickSmoothTimer();
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
    geography: 'Géographie',
    standard_object: 'Objet',
    sports: 'Sport',
    space: 'Espace'
  })[cat] || cat;
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

/** Calcule hauteur px référence + px/mètre pour l'échelle de scène. */
function sceneScale(refSizeM, estimateMHint) {
  const ref = Math.max(1e-9, refSizeM);
  const est = Math.max(ref * 0.15, estimateMHint || ref);
  // Fit both in STAGE_H: tallest gets STAGE_H
  const tallest = Math.max(ref, est);
  const pxPerM = STAGE_H / tallest;
  // Keep reference at least readable
  const refH = Math.max(36, ref * pxPerM);
  return { pxPerM, refH };
}

function setEstimateFromPx(estPx) {
  const s = state;
  if (!s?.reference || s.myLocked || s.phase !== 'estimate') return;
  const { pxPerM } = sceneScale(s.reference.sizeM, estimateM || s.reference.sizeM);
  const minPx = 24;
  const maxPx = STAGE_H;
  const h = Math.max(minPx, Math.min(maxPx, estPx));
  // Recalculate with new height dominating if needed
  const ref = s.reference.sizeM;
  const tentativeM = h / (STAGE_H / Math.max(ref, h / (STAGE_H / Math.max(ref, estimateM || ref))));
  // Simpler: fix pxPerM so reference stays at REF_FRAC*STAGE_H or scales with estimate
  const refTarget = Math.min(STAGE_H * REF_FRAC, STAGE_H);
  let ppm = refTarget / ref;
  let estH = estimateM ? estimateM * ppm : h;
  // If estimate would exceed stage, shrink scale
  if (estH > STAGE_H) {
    ppm = STAGE_H / (h / ppm || estimateM || ref);
    estH = STAGE_H;
    // recompute from desired pixel height
  }
  // Direct approach from pixel height with adaptive scale:
  const scale = computeAdaptiveScale(ref, h);
  estimateM = h / scale.pxPerM;
  applyStageHeights(scale.refH, h);
  updateEstLabel();
  socket.emit('si-update-estimate', { valueM: estimateM });
}

function computeAdaptiveScale(refSizeM, estPx) {
  const ref = Math.max(1e-9, refSizeM);
  // Convert estPx to meters assuming we'll solve for pxPerM such that max(refH, estPx)=STAGE_H
  // Iterate: guess estimateM from previous
  let guessM = estimateM || ref;
  for (let i = 0; i < 3; i++) {
    const tallest = Math.max(ref, guessM);
    const pxPerM = STAGE_H / tallest;
    guessM = estPx / pxPerM;
  }
  const tallest = Math.max(ref, guessM);
  const pxPerM = STAGE_H / tallest;
  return {
    pxPerM,
    refH: Math.max(28, ref * pxPerM),
    estH: Math.max(24, Math.min(STAGE_H, guessM * pxPerM))
  };
}

function applyStageHeights(refH, estH) {
  const refSil = $('ref-sil');
  const estSil = $('est-sil');
  const handle = $('est-handle');
  if (refSil) {
    refSil.style.height = `${refH}px`;
    refSil.style.width = `${Math.max(20, refH * 0.35)}px`;
  }
  if (estSil) {
    estSil.style.height = `${estH}px`;
    estSil.style.width = 'auto';
  }
  if (handle) {
    handle.style.bottom = `${estH - 8}px`;
  }
}

function updateEstLabel() {
  const unit = state?.puzzle?.unit || 'm';
  const native = metersToNative(estimateM, unit);
  $('est-value').textContent = formatSize(native, unit);
}

function initEstimateStage(s) {
  const puzzle = s.puzzle;
  const ref = s.reference;
  if (!puzzle || !ref) return;

  $('puzzle-cat').textContent = categoryLabel(puzzle.category);
  $('puzzle-name').textContent = puzzle.name;
  $('puzzle-dim').textContent = `Estime : ${puzzle.dimension || 'taille'} · Réf. ${ref.label} (${formatSize(metersToNative(ref.sizeM, puzzle.unit), puzzle.unit)})`;
  $('ref-label').textContent = `${ref.label}`;

  const estSil = $('est-sil');
  if (puzzle.id !== lastPuzzleId) {
    lastPuzzleId = puzzle.id;
    estSil.src = puzzle.svgUrl;
    // Start estimate near reference size
    estimateM = s.myEstimateM && s.myEstimateM > 0 ? s.myEstimateM : ref.sizeM;
  } else if (s.myEstimateM && s.myEstimateM > 0 && !dragging) {
    estimateM = s.myEstimateM;
  }

  const scale = computeAdaptiveScale(ref.sizeM, (estimateM || ref.sizeM) * (STAGE_H / Math.max(ref.sizeM, estimateM || ref.sizeM)));
  // Recompute cleanly
  const tallest = Math.max(ref.sizeM, estimateM || ref.sizeM);
  const pxPerM = STAGE_H / tallest;
  const refH = Math.max(28, ref.sizeM * pxPerM);
  const estH = Math.max(24, (estimateM || ref.sizeM) * pxPerM);
  applyStageHeights(refH, estH);
  updateEstLabel();

  const locked = Boolean(s.myLocked);
  $('btn-lock').disabled = locked;
  $('btn-lock').textContent = locked ? '🔒 Verrouillé' : '🔒 Verrouiller';
  $('est-handle').style.display = locked ? 'none' : 'block';
  $('si-stage').classList.toggle('si-locked', locked);

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
  const pxPerM = STAGE_H / maxM;

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

/* —— Resize interactions —— */
function pxFromPointer(clientY) {
  const wrap = $('est-wrap');
  const rect = wrap.getBoundingClientRect();
  // height from bottom of wrap
  return Math.max(24, Math.min(STAGE_H, rect.bottom - clientY));
}

function onPointerDown(e) {
  if (!state || state.phase !== 'estimate' || state.myLocked) return;
  dragging = true;
  const y = e.touches ? e.touches[0].clientY : e.clientY;
  setEstimateHeightPx(pxFromPointer(y));
  e.preventDefault();
}

function onPointerMove(e) {
  if (!dragging) return;
  const y = e.touches ? e.touches[0].clientY : e.clientY;
  setEstimateHeightPx(pxFromPointer(y));
  e.preventDefault();
}

function onPointerUp() {
  dragging = false;
}

function setEstimateHeightPx(estPx) {
  if (!state?.reference || state.myLocked) return;
  const ref = state.reference.sizeM;
  // Solve estimateM so that with adaptive scale, visual height ≈ estPx
  let guess = estimateM || ref;
  for (let i = 0; i < 4; i++) {
    const tallest = Math.max(ref, guess);
    const pxPerM = STAGE_H / tallest;
    guess = estPx / pxPerM;
  }
  estimateM = Math.max(ref * 0.02, guess);
  const tallest = Math.max(ref, estimateM);
  const pxPerM = STAGE_H / tallest;
  applyStageHeights(Math.max(28, ref * pxPerM), Math.max(24, estimateM * pxPerM));
  updateEstLabel();
  socket.emit('si-update-estimate', { valueM: estimateM });
}

const handle = () => $('est-handle');
const estWrap = () => $('est-wrap');

document.addEventListener('mousemove', onPointerMove);
document.addEventListener('mouseup', onPointerUp);
document.addEventListener('touchmove', onPointerMove, { passive: false });
document.addEventListener('touchend', onPointerUp);

$('est-handle')?.addEventListener('mousedown', onPointerDown);
$('est-wrap')?.addEventListener('mousedown', onPointerDown);
$('est-handle')?.addEventListener('touchstart', onPointerDown, { passive: false });
$('est-wrap')?.addEventListener('touchstart', onPointerDown, { passive: false });

$('est-wrap')?.addEventListener('wheel', (e) => {
  if (!state || state.phase !== 'estimate' || state.myLocked) return;
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.92 : 1.08;
  estimateM = Math.max((state.reference?.sizeM || 1) * 0.02, (estimateM || state.reference.sizeM) * factor);
  const ref = state.reference.sizeM;
  const tallest = Math.max(ref, estimateM);
  const pxPerM = STAGE_H / tallest;
  applyStageHeights(Math.max(28, ref * pxPerM), Math.max(24, estimateM * pxPerM));
  updateEstLabel();
  socket.emit('si-update-estimate', { valueM: estimateM });
}, { passive: false });

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
  if (!estimateM || estimateM <= 0) return showToast('Ajuste d\'abord la silhouette');
  socket.emit('si-lock', { valueM: estimateM });
});

$('btn-next-round').addEventListener('click', () => socket.emit('si-next-round'));
$('btn-rematch').addEventListener('click', () => socket.emit('si-rematch'));
$('btn-end-lobby').addEventListener('click', () => socket.emit('si-back-to-lobby'));

const roomFromUrl = new URLSearchParams(location.search).get('room');
if (roomFromUrl) {
  $('join-code').value = roomFromUrl.toUpperCase();
  $('join-panel').style.display = 'block';
}
