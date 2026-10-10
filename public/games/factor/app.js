/* FACTOR client */
const GAME_ID = 'factor';
const GAME_PATH = '/games/factor/';
const BEST_KEY = 'factor-best-score';
const socket = io({ transports: ['websocket', 'polling'] });

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

let state = null;
let direction = 'plus';
let factor = 10;
let localPhaseEndsAt = null;
let syncedPhaseEndsAt = null;
let syncedPhase = null;
let pendingSoloStart = false;

const escapeHtml =
  typeof window !== 'undefined' && window.escapeHtml
    ? window.escapeHtml
    : (s) =>
        String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  const s = $(id);
  if (s) s.classList.add('active');
}

function setStatus(text, ok) {
  const el = $('connection-status');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('ok', Boolean(ok));
}

/** Slider 0–1000 → facteur log 1–1000 */
function sliderToFactor(v) {
  const t = Math.max(0, Math.min(1000, Number(v) || 0)) / 1000;
  const f = Math.pow(1000, t);
  return Math.max(1, Math.min(1000, Math.round(f * 10) / 10));
}

function factorToSlider(f) {
  const x = Math.max(1, Math.min(1000, Number(f) || 1));
  return Math.round((Math.log(x) / Math.log(1000)) * 1000);
}

function formatNum(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  if (Math.abs(x) >= 1e9) return `${(x / 1e9).toFixed(2)} Md`;
  if (Math.abs(x) >= 1e6) return `${(x / 1e6).toFixed(2)} M`;
  if (Math.abs(x) >= 1e3) return `${(x / 1e3).toFixed(1)} k`;
  if (Math.abs(x) < 10) return String(Math.round(x * 100) / 100);
  return String(Math.round(x));
}

function guessRatio() {
  return direction === 'moins' ? 1 / factor : factor;
}

function updateGuessUI() {
  const label = $('factor-label');
  if (label) label.textContent = direction === 'moins' ? `÷${factor}` : `×${factor}`;
  const aVal = state?.question?.a?.value;
  const preview = $('estimate-preview');
  if (preview && Number.isFinite(aVal)) {
    const est = aVal * guessRatio();
    const unit = state.question.a.unit || '';
    preview.textContent = `${formatNum(est)} ${unit}`.trim();
  } else if (preview) {
    preview.textContent = '—';
  }
}

function syncTimers(s) {
  if (s.phase !== syncedPhase || s.phaseEndsAt !== syncedPhaseEndsAt) {
    if (typeof s.phaseRemainingMs === 'number') {
      localPhaseEndsAt = Date.now() + s.phaseRemainingMs;
    } else {
      localPhaseEndsAt = s.phaseEndsAt || null;
    }
    syncedPhaseEndsAt = s.phaseEndsAt;
  }
  syncedPhase = s.phase;
}

function tickTimers() {
  if (!state || state.phase !== 'answering' || localPhaseEndsAt == null) return;
  const left = Math.max(0, localPhaseEndsAt - Date.now());
  if ($('ans-timer')) $('ans-timer').textContent = String(Math.ceil(left / 1000));
}

function collectSettings() {
  return {
    roundCount: parseInt($('set-rounds').value, 10),
    answerSec: parseInt($('set-time').value, 10)
  };
}

function pushSettings() {
  if (!state?.isHost || state.phase !== 'lobby') return;
  socket.emit('fct-update-settings', collectSettings());
}

function renderPlayers(el, players) {
  if (!el) return;
  el.innerHTML = (players || [])
    .map(
      (p) =>
        `<li>${escapeHtml(p.name)}${p.isHost ? ' · hôte' : ''}${
          p.hasAnswered ? ' · ✓' : ''
        } · <strong>${p.score || 0}</strong></li>`
    )
    .join('');
}

function renderRanking(el, ranking) {
  if (!el) return;
  el.innerHTML = (ranking || [])
    .map(
      (p, i) =>
        `<li><span>#${i + 1} ${escapeHtml(p.name)}</span><strong>${p.score} pts</strong></li>`
    )
    .join('') || '<li class="muted">—</li>';
}

function showBest() {
  const el = $('solo-best');
  if (!el) return;
  const best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
  el.textContent = best > 0 ? `Record solo local : ${best} pts` : '';
}

function maybeSaveBest(total) {
  const prev = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
  if (total > prev) {
    localStorage.setItem(BEST_KEY, String(total));
    return true;
  }
  return false;
}

function render(s) {
  state = s;
  $('room-nav').style.display = s.phase === 'lobby' || s.phase === 'home' ? 'none' : 'flex';
  if (s.phase && s.phase !== 'lobby') $('room-nav').style.display = 'flex';

  if (s.phase === 'lobby') {
    showScreen('screen-lobby');
    $('lobby-code').textContent = s.code || '------';
    $('lobby-player-count').textContent = `(${s.players?.length || 0}/${s.maxPlayers || 12})`;
    renderPlayers($('lobby-players'), s.players);
    $('lobby-min-hint').textContent =
      s.players?.length >= 1
        ? 'Solo possible · invite des amis pour le multijoueur.'
        : `Minimum ${s.minPlayers} joueur.`;
    $('host-settings').style.display = s.isHost ? 'block' : 'none';
    if (s.isHost && !document.activeElement?.closest?.('#host-settings')) {
      $('set-rounds').value = String(s.settings.roundCount);
      $('set-time').value = String(s.settings.answerSec);
    }
    if (pendingSoloStart && s.isHost) {
      pendingSoloStart = false;
      socket.emit('fct-start-game', collectSettings());
    }
    return;
  }

  if (s.phase === 'answering') {
    showScreen('screen-answer');
    $('ans-round').textContent = `Manche ${s.currentRound}/${s.roundCount}`;
    $('ans-answered').textContent = `${s.answeredCount || 0}/${s.players?.length || 0}`;
    const q = s.question;
    if (q?.a) {
      $('ans-a-label').textContent = q.a.label;
      $('ans-a-value').textContent = `${formatNum(q.a.value)} ${q.a.unit || ''}`.trim();
      $('ans-a-meta').textContent = [q.a.year, q.a.region, q.a.source]
        .filter(Boolean)
        .join(' · ');
    }
    if (q?.b) {
      $('ans-b-label').textContent = q.b.label;
      $('ans-b-meta').textContent = [q.b.year, q.b.region].filter(Boolean).join(' · ');
    }
    const locked = Boolean(s.myAnswer);
    $('guess-panel')?.classList.toggle('locked', locked);
    $('locked-msg').style.display = locked ? 'block' : 'none';
    $('btn-lock').style.display = locked ? 'none' : 'inline-block';
    if (locked) {
      direction = s.myAnswer.direction;
      factor = s.myAnswer.factor;
      $('factor-slider').value = String(factorToSlider(factor));
      $('btn-plus')?.classList.toggle('active', direction === 'plus');
      $('btn-moins')?.classList.toggle('active', direction === 'moins');
    }
    updateGuessUI();
    return;
  }

  if (s.phase === 'reveal') {
    showScreen('screen-reveal');
    $('rev-round').textContent = `Manche ${s.currentRound}/${s.roundCount}`;
    const rev = s.reveal;
    if (rev) {
      $('rev-b-label').textContent = rev.b?.label || '—';
      $('rev-b-value').textContent = `${formatNum(rev.b?.value)} ${rev.b?.unit || ''}`.trim();
      $('rev-ratio').textContent = `Rapport réel : ${rev.realRatioLabel}`;
      $('rev-sources').textContent = [
        rev.a && `Réf. : ${rev.a.source}`,
        rev.b && `Estimée : ${rev.b.source}`
      ]
        .filter(Boolean)
        .join(' · ');
      $('rev-results').innerHTML = (rev.results || [])
        .map((r) => {
          const guess = r.answered
            ? `${r.direction === 'moins' ? '÷' : '×'}${r.factor}`
            : '—';
          return `<li><span>${escapeHtml(r.name)} · ${guess}</span><strong>${r.points} pts</strong></li>`;
        })
        .join('');
      renderRanking($('rev-ranking'), s.ranking);
    }
    return;
  }

  if (s.phase === 'game_over') {
    showScreen('screen-end');
    renderRanking($('end-ranking'), s.ranking);
    const total = s.myScore || 0;
    const beat = maybeSaveBest(total);
    $('end-best').textContent = beat
      ? `Nouveau record solo : ${total} pts !`
      : `Score : ${total} pts`;
    showBest();
    $('btn-rematch').style.display = s.isHost ? 'inline-block' : 'none';
    $('btn-end-lobby').style.display = s.isHost ? 'inline-block' : 'none';
  }
}

socket.on('connect', () => setStatus('Connecté', true));
socket.on('disconnect', () => setStatus('Déconnecté…', false));
socket.on('error-msg', (msg) => {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg || 'Erreur';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
});
socket.on('left-room', () => {
  state = null;
  showScreen('screen-home');
  $('room-nav').style.display = 'none';
  showBest();
});
socket.on('room-state', (s) => {
  if (s.gameId && s.gameId !== GAME_ID) return;
  render(s);
  syncTimers(s);
  tickTimers();
});

function playerName() {
  return $('player-name').value.trim() || 'Joueur';
}

$('btn-create')?.addEventListener('click', () => {
  pendingSoloStart = false;
  socket.emit('create-room', { playerName: playerName(), gameId: GAME_ID });
});
$('btn-solo')?.addEventListener('click', () => {
  pendingSoloStart = true;
  socket.emit('create-room', { playerName: playerName(), gameId: GAME_ID });
});
$('btn-show-join')?.addEventListener('click', () => {
  $('join-panel').style.display = 'block';
});
$('btn-join')?.addEventListener('click', () => {
  const code = $('join-code').value.trim().toUpperCase();
  socket.emit('join-room', { code, playerName: playerName(), gameId: GAME_ID });
});
$('btn-start')?.addEventListener('click', () => {
  socket.emit('fct-update-settings', collectSettings());
  socket.emit('fct-start-game', collectSettings());
});
['set-rounds', 'set-time'].forEach((id) => {
  $(id)?.addEventListener('change', pushSettings);
});

$('btn-plus')?.addEventListener('click', () => {
  direction = 'plus';
  $('btn-plus').classList.add('active');
  $('btn-moins').classList.remove('active');
  updateGuessUI();
});
$('btn-moins')?.addEventListener('click', () => {
  direction = 'moins';
  $('btn-moins').classList.add('active');
  $('btn-plus').classList.remove('active');
  updateGuessUI();
});
$('factor-slider')?.addEventListener('input', (e) => {
  factor = sliderToFactor(e.target.value);
  updateGuessUI();
});
$('btn-lock')?.addEventListener('click', () => {
  socket.emit('fct-submit', { direction, factor });
});

$('btn-salon')?.addEventListener('click', () => {
  if (!state?.isHost) return;
  socket.emit('fct-back-to-lobby');
});
$('btn-menu')?.addEventListener('click', () => {
  socket.emit('leave-room');
  location.href = '/';
});
$('btn-rematch')?.addEventListener('click', () => {
  if (!state?.isHost) return;
  socket.emit('fct-rematch');
});
$('btn-end-lobby')?.addEventListener('click', () => {
  if (!state?.isHost) return;
  socket.emit('fct-back-to-lobby');
});
$('btn-copy-code')?.addEventListener('click', () => {
  if (state?.code) navigator.clipboard?.writeText(state.code);
});
$('btn-copy-link')?.addEventListener('click', () => {
  if (state?.code) {
    navigator.clipboard?.writeText(`${location.origin}${GAME_PATH}?room=${state.code}`);
  }
});

if (params.get('room')) {
  $('join-panel').style.display = 'block';
  $('join-code').value = params.get('room').toUpperCase();
}

$('factor-slider').value = String(factorToSlider(10));
factor = 10;
updateGuessUI();
showBest();
setInterval(tickTimers, 100);
