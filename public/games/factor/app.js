/* FACTOR client */
const GAME_ID = 'factor';
const GAME_PATH = '/games/factor/';
const BEST_KEY = 'factor-best-score';
const SESSION_KEY = 'factor-session';
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
let pendingHomeSettings = null;
let submitPending = false;

const escapeHtml =
  typeof window !== 'undefined' && window.escapeHtml
    ? window.escapeHtml
    : (s) =>
        String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg || 'Erreur';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

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

function saveSession(s) {
  if (!s?.code || !s?.reconnectToken) return;
  if (s.phase !== 'answering' && s.phase !== 'reveal') return;
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        code: s.code,
        token: s.reconnectToken,
        name: s.myName || playerName()
      })
    );
  } catch {
    /* ignore */
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function tryReclaim() {
  const session = loadSession();
  if (!session?.code || !session?.token || !socket.connected) return;
  socket.emit('fct-reclaim', { code: session.code, token: session.token });
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

  const a = state?.question?.a;
  const b = state?.question?.b;
  const target = $('estimate-target');
  if (target) {
    target.textContent = b?.label ? `« ${b.label} »` : 'la donnée cachée';
  }
  const hint = $('guess-hint');
  if (hint && a?.label && b?.label) {
    hint.textContent = `Combien de fois « ${b.label} » est-elle plus grande ou plus petite que « ${a.label} » ?`;
  }

  const aVal = a?.value;
  const preview = $('estimate-preview');
  if (preview && Number.isFinite(aVal)) {
    const est = aVal * guessRatio();
    const unit = b?.unit || a?.unit || '';
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
  const timerEl = $('ans-timer');
  if (timerEl) timerEl.textContent = String(Math.ceil(left / 1000));
  const lockedMsg = $('locked-msg');
  if (lockedMsg && state.myAnswer && left <= 0) {
    lockedMsg.textContent = 'Temps écoulé — révélation en cours…';
  }
}

function collectSettings() {
  const homeVisible = $('screen-home')?.classList.contains('active');
  const rounds = homeVisible ? $('home-rounds') : $('set-rounds');
  const time = homeVisible ? $('home-time') : $('set-time');
  return {
    roundCount: parseInt(rounds?.value || $('home-rounds')?.value || '10', 10),
    answerSec: parseInt(time?.value || $('home-time')?.value || '20', 10)
  };
}

function syncSettingsToLobby(settings) {
  if ($('set-rounds') && settings.roundCount != null) {
    $('set-rounds').value = String(settings.roundCount);
  }
  if ($('set-time') && settings.answerSec != null) {
    $('set-time').value = String(settings.answerSec);
  }
  if ($('home-rounds') && settings.roundCount != null) {
    $('home-rounds').value = String(settings.roundCount);
  }
  if ($('home-time') && settings.answerSec != null) {
    $('home-time').value = String(settings.answerSec);
  }
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
        }${p.disconnected ? ' · ⚠' : ''} · <strong>${p.score || 0}</strong></li>`
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

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function render(s) {
  state = s;
  submitPending = false;
  const nav = $('room-nav');
  if (nav) {
    nav.style.display = s.phase === 'lobby' || s.phase === 'home' ? 'none' : 'flex';
    if (s.phase && s.phase !== 'lobby') nav.style.display = 'flex';
  }

  if (s.phase === 'lobby') {
    clearSession();
    showScreen('screen-lobby');
    setText('lobby-code', s.code || '------');
    setText(
      'lobby-player-count',
      `(${s.players?.length || 0}/${s.maxPlayers || 12})`
    );
    renderPlayers($('lobby-players'), s.players);
    setText(
      'lobby-min-hint',
      s.players?.length >= 1
        ? 'Solo possible · invite des amis pour le multijoueur.'
        : `Minimum ${s.minPlayers} joueur.`
    );
    const hostSettings = $('host-settings');
    if (hostSettings) hostSettings.style.display = s.isHost ? 'block' : 'none';
    if (s.isHost && pendingHomeSettings) {
      const settings = pendingHomeSettings;
      pendingHomeSettings = null;
      syncSettingsToLobby(settings);
      socket.emit('fct-update-settings', settings);
      if (pendingSoloStart) {
        pendingSoloStart = false;
        socket.emit('fct-start-game', settings);
      }
    } else if (s.isHost && !document.activeElement?.closest?.('#host-settings')) {
      syncSettingsToLobby(s.settings);
    }
    return;
  }

  if (s.phase === 'answering') {
    saveSession(s);
    showScreen('screen-answer');
    setText('ans-round', `Manche ${s.currentRound}/${s.roundCount}`);
    setText(
      'ans-answered',
      `${s.answeredCount || 0}/${s.players?.length || 0}`
    );
    const q = s.question;
    if (q?.a) {
      setText('ans-a-label', q.a.label);
      setText('ans-a-value', `${formatNum(q.a.value)} ${q.a.unit || ''}`.trim());
      setText(
        'ans-a-meta',
        [q.a.year, q.a.region, q.a.source].filter(Boolean).join(' · ')
      );
    }
    if (q?.b) {
      setText('ans-b-label', q.b.label);
      setText(
        'ans-b-meta',
        [q.b.year, q.b.region].filter(Boolean).join(' · ')
      );
    }
    const locked = Boolean(s.myAnswer);
    $('guess-panel')?.classList.toggle('locked', locked);
    const lockedMsg = $('locked-msg');
    if (lockedMsg) {
      lockedMsg.style.display = locked ? 'block' : 'none';
      lockedMsg.textContent = 'Estimation verrouillée — en attente des autres…';
    }
    const btnLock = $('btn-lock');
    if (btnLock) {
      btnLock.style.display = locked ? 'none' : 'inline-block';
      btnLock.disabled = false;
    }
    if (locked) {
      direction = s.myAnswer.direction;
      factor = s.myAnswer.factor;
      if ($('factor-slider')) $('factor-slider').value = String(factorToSlider(factor));
      $('btn-plus')?.classList.toggle('active', direction === 'plus');
      $('btn-moins')?.classList.toggle('active', direction === 'moins');
    }
    updateGuessUI();
    return;
  }

  if (s.phase === 'reveal') {
    saveSession(s);
    showScreen('screen-reveal');
    setText('rev-round', `Manche ${s.currentRound}/${s.roundCount}`);
    const rev = s.reveal;
    if (rev) {
      setText('rev-b-label', rev.b?.label || '—');
      setText(
        'rev-b-value',
        `${formatNum(rev.b?.value)} ${rev.b?.unit || ''}`.trim()
      );
      setText('rev-ratio', `Rapport réel : ${rev.realRatioLabel}`);
      setText(
        'rev-sources',
        [rev.a && `Réf. : ${rev.a.source}`, rev.b && `Estimée : ${rev.b.source}`]
          .filter(Boolean)
          .join(' · ')
      );
      const resultsEl = $('rev-results');
      if (resultsEl) {
        resultsEl.innerHTML = (rev.results || [])
          .map((r) => {
            const guess = r.answered
              ? `${r.direction === 'moins' ? '÷' : '×'}${r.factor}`
              : '—';
            return `<li><span>${escapeHtml(r.name)} · ${guess}</span><strong>${r.points} pts</strong></li>`;
          })
          .join('');
      }
      renderRanking($('rev-ranking'), s.ranking);
    }
    return;
  }

  if (s.phase === 'game_over') {
    clearSession();
    showScreen('screen-end');
    renderRanking($('end-ranking'), s.ranking);
    const total = s.myScore || 0;
    const beat = maybeSaveBest(total);
    setText(
      'end-best',
      beat ? `Nouveau record solo : ${total} pts !` : `Score : ${total} pts`
    );
    showBest();
    const rematch = $('btn-rematch');
    const endLobby = $('btn-end-lobby');
    if (rematch) rematch.style.display = s.isHost ? 'inline-block' : 'none';
    if (endLobby) endLobby.style.display = s.isHost ? 'inline-block' : 'none';
  }
}

socket.on('connect', () => {
  setStatus('Connecté', true);
  if (state && (state.phase === 'answering' || state.phase === 'reveal')) {
    tryReclaim();
  } else if (!state) {
    const session = loadSession();
    if (session?.code && session?.token) tryReclaim();
  }
});
socket.on('disconnect', () => {
  setStatus('Déconnecté — reconnexion…', false);
  if (state && (state.phase === 'answering' || state.phase === 'reveal')) {
    showToast('Connexion coupée — reprise automatique…');
  }
});
socket.on('error-msg', (msg) => {
  submitPending = false;
  const btnLock = $('btn-lock');
  if (btnLock) btnLock.disabled = false;
  showToast(msg);
  if (String(msg || '').includes('introuvable') || String(msg || '').includes('reprendre')) {
    clearSession();
  }
});
socket.on('left-room', () => {
  state = null;
  clearSession();
  showScreen('screen-home');
  if ($('room-nav')) $('room-nav').style.display = 'none';
  showBest();
});
socket.on('room-state', (s) => {
  if (s.gameId && s.gameId !== GAME_ID) return;
  try {
    render(s);
    syncTimers(s);
    tickTimers();
  } catch (err) {
    console.error('FACTOR render error', err);
    showToast('Erreur d’affichage — réessaie ou recharge.');
  }
});

function playerName() {
  return $('player-name')?.value.trim() || 'Joueur';
}

function submitEstimate() {
  if (submitPending) return;
  if (!socket.connected) {
    showToast('Pas de connexion — attends la reconnexion…');
    return;
  }
  if (state && state.phase !== 'answering') {
    showToast('Ce n’est plus le moment d’estimer.');
    return;
  }
  if (state?.myAnswer) {
    showToast('Estimation déjà verrouillée.');
    return;
  }
  submitPending = true;
  const btnLock = $('btn-lock');
  if (btnLock) btnLock.disabled = true;
  socket.emit('fct-submit', { direction, factor });
  // Sécurité : si aucune réponse serveur, réactiver
  setTimeout(() => {
    if (submitPending) {
      submitPending = false;
      if (btnLock && !state?.myAnswer) btnLock.disabled = false;
    }
  }, 4000);
}

$('btn-create')?.addEventListener('click', () => {
  clearSession();
  pendingSoloStart = false;
  pendingHomeSettings = {
    roundCount: parseInt($('home-rounds')?.value || '10', 10),
    answerSec: parseInt($('home-time')?.value || '20', 10)
  };
  syncSettingsToLobby(pendingHomeSettings);
  socket.emit('create-room', { playerName: playerName(), gameId: GAME_ID });
});
$('btn-solo')?.addEventListener('click', () => {
  clearSession();
  pendingSoloStart = true;
  pendingHomeSettings = {
    roundCount: parseInt($('home-rounds')?.value || '10', 10),
    answerSec: parseInt($('home-time')?.value || '20', 10)
  };
  syncSettingsToLobby(pendingHomeSettings);
  socket.emit('create-room', { playerName: playerName(), gameId: GAME_ID });
});
$('btn-show-join')?.addEventListener('click', () => {
  $('join-panel').style.display = 'block';
});
$('btn-join')?.addEventListener('click', () => {
  clearSession();
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
$('btn-lock')?.addEventListener('click', submitEstimate);

$('btn-salon')?.addEventListener('click', () => {
  if (!state?.isHost) return;
  clearSession();
  socket.emit('fct-back-to-lobby');
});
$('btn-menu')?.addEventListener('click', () => {
  clearSession();
  socket.emit('leave-room');
  location.href = '/';
});
$('btn-rematch')?.addEventListener('click', () => {
  if (!state?.isHost) return;
  socket.emit('fct-rematch');
});
$('btn-end-lobby')?.addEventListener('click', () => {
  if (!state?.isHost) return;
  clearSession();
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
  if ($('join-panel')) $('join-panel').style.display = 'block';
  if ($('join-code')) $('join-code').value = params.get('room').toUpperCase();
}

if ($('factor-slider')) {
  $('factor-slider').value = String(factorToSlider(10));
}
factor = 10;
updateGuessUI();
showBest();
setInterval(tickTimers, 100);
