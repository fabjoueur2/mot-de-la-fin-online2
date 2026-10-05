const GAME_ID = 'qui-dit-mieux';
const GAME_PATH = '/games/qui-dit-mieux/';
const socket = io({ transports: ['websocket', 'polling'] });

let state = null;
let timerAnimId = null;
let smoothTimer = {
  endsAt: null,
  durationMs: 30000,
  frozenPct: 100,
  running: false
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
  socket.emit('qdm-back-to-lobby');
}

function pushSettings() {
  if (!state?.isHost) return;
  socket.emit('qdm-update-settings', {
    bidDurationSec: parseInt($('set-bid-duration').value, 10),
    roundCount: parseInt($('set-round-count').value, 10)
  });
}

function formatMmSs(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/** Vert → jaune → rouge selon le % restant (comme Mot de la fin). */
function timerFillColor(pct) {
  const t = 1 - Math.max(0, Math.min(100, pct)) / 100;
  const stops = [
    [0, [107, 203, 119]],
    [0.5, [255, 217, 61]],
    [1, [255, 107, 107]]
  ];
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
  const fill = $('qdm-timer-fill');
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

/**
 * Recale le chrono local sur le remaining serveur (évite le décalage d'horloge
 * qui affichait 00:00 alors que le serveur avait encore du temps).
 */
function syncSmoothTimer(s) {
  const durationSec = s.settings?.bidDurationSec || 30;
  smoothTimer.durationMs = durationSec * 1000;

  stopSmoothTimer();

  if (s.phase !== 'bidding') {
    applyTimerFill(s.phase === 'lobby' ? 100 : 0);
    updateTimerDisplay(0);
    $('game-timer')?.classList.remove('warning', 'danger');
    return;
  }

  const leftMs = typeof s.auctionRemainingMs === 'number'
    ? Math.max(0, s.auctionRemainingMs)
    : (s.auctionEndsAt ? Math.max(0, s.auctionEndsAt - Date.now()) : 0);

  smoothTimer.endsAt = Date.now() + leftMs;
  smoothTimer.frozenPct = smoothTimer.durationMs
    ? (leftMs / smoothTimer.durationMs) * 100
    : 0;
  smoothTimer.running = leftMs > 0;
  applyTimerFill(smoothTimer.frozenPct);
  updateTimerDisplay(leftMs);
  if (smoothTimer.running) tickSmoothTimer();
}

function renderScores(listEl, players) {
  if (!listEl) return;
  const sorted = [...(players || [])].sort((a, b) => (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name));
  listEl.innerHTML = sorted.map((p, i) => {
    const badges = [
      p.isHost ? '<span class="qdm-badge">Hôte</span>' : '',
      p.isOpener && state?.phase === 'bidding' ? '<span class="qdm-badge qdm-badge-opener">Ouvreur</span>' : '',
      p.isChallenger && (state?.phase === 'action' || state?.phase === 'voting')
        ? '<span class="qdm-badge qdm-badge-challenger">Challenger</span>'
        : '',
      p.id === state?.myId ? '<span class="qdm-badge qdm-badge-me">Vous</span>' : ''
    ].filter(Boolean).join(' ');
    return `<li><span class="qdm-rank">${i + 1}.</span> <strong>${escapeHtml(p.name)}</strong> ${badges}<span class="qdm-score">${p.score || 0} pts</span></li>`;
  }).join('');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLobby(s) {
  $('lobby-code').textContent = s.code;
  $('lobby-player-count').textContent = `(${s.players.length})`;
  $('lobby-min-hint').textContent = `Minimum ${s.minPlayers || 3} joueurs pour lancer.`;
  renderScores($('lobby-players'), s.players);

  const hostSettings = $('host-settings');
  const guestWait = $('guest-wait');
  if (s.isHost) {
    hostSettings.style.display = 'block';
    guestWait.style.display = 'none';
    $('set-bid-duration').value = String(s.settings.bidDurationSec);
    $('set-round-count').value = String(s.settings.roundCount);
    $('btn-start-game').disabled = s.players.length < (s.minPlayers || 3);
  } else {
    hostSettings.style.display = 'none';
    guestWait.style.display = 'block';
  }
}

function renderGame(s) {
  $('game-round').textContent = `Manche ${s.currentRound} / ${s.roundCount}`;
  $('challenge-text').textContent = s.challenge?.texte || '—';
  $('challenge-unit').textContent = s.challenge?.unite
    ? `Unité : ${s.challenge.unite}`
    : '';

  const bidding = $('panel-bidding');
  const action = $('panel-action');
  const voting = $('panel-voting');
  const lastRes = $('panel-last-result');

  bidding.style.display = s.phase === 'bidding' ? 'block' : 'none';
  action.style.display = s.phase === 'action' ? 'block' : 'none';
  voting.style.display = s.phase === 'voting' ? 'block' : 'none';

  if (s.lastResult && (s.phase === 'bidding' || s.phase === 'end')) {
    lastRes.style.display = 'block';
    const r = s.lastResult;
    lastRes.className = `card ${r.success ? 'qdm-result-ok' : 'qdm-result-ko'}`;
    $('last-result-text').textContent = r.success
      ? `✅ ${r.challengerName} a réussi (${r.bid} ${r.challenge?.unite || ''}) → +${r.pointsAwarded} pts`
      : `❌ ${r.challengerName} a raté (${r.bid} ${r.challenge?.unite || ''}) → +1 pt pour les autres`;
  } else {
    lastRes.style.display = 'none';
  }

  syncSmoothTimer(s);

  if (s.phase === 'bidding') {
    $('bidding-opener').textContent = `Ouvreur de la manche : ${s.openerName}`;
    $('current-bid').textContent = s.currentBid > 0 ? String(s.currentBid) : '—';
    $('current-bidder').textContent = s.currentBidderName
      ? s.currentBidderName
      : 'En attente d\'une enchère…';
    const nextMin = (s.currentBid || 0) + 1;
    $('bid-input').min = String(nextMin);
    if (!$('bid-input').value || parseInt($('bid-input').value, 10) <= s.currentBid) {
      $('bid-input').value = String(nextMin);
    }
    $('bid-history').innerHTML = (s.bids || []).slice().reverse().slice(0, 8).map((b) =>
      `<li><strong>${escapeHtml(b.name)}</strong> → <span class="qdm-score">${b.value}</span></li>`
    ).join('') || '<li class="share-hint">Aucune enchère pour l\'instant</li>';
  }

  if (s.phase === 'action') {
    $('action-promise').textContent = `${s.currentBidderName} doit réaliser : ${s.currentBid} ${s.challenge?.unite || ''}`;
    const canGoVote = s.isHost || s.myId === s.currentBidderId;
    $('btn-go-vote').style.display = canGoVote ? 'block' : 'none';
    $('action-hint').textContent = s.myId === s.currentBidderId
      ? 'À vous ! Faites votre perf en vocal Discord, puis passez au vote.'
      : `Écoutez ${s.currentBidderName} sur Discord…`;
  }

  if (s.phase === 'voting') {
    $('vote-question').textContent =
      `${s.currentBidderName} a-t-il / elle tenu sa promesse (${s.currentBid} ${s.challenge?.unite || ''}) ?`;
    const t = s.voteTally || { yes: 0, no: 0, pending: 0, total: 0 };
    $('vote-tally').textContent = `Oui ${t.yes} · Non ${t.no} · En attente ${t.pending} / ${t.total}`;
    const showBtns = s.canVote;
    $('vote-buttons').style.display = showBtns ? 'flex' : 'none';
    $('vote-waiting').style.display = !showBtns && s.myId !== s.currentBidderId ? 'block' : 'none';
    if (s.myId === s.currentBidderId) {
      $('vote-waiting').style.display = 'block';
      $('vote-waiting').textContent = 'Vous êtes le challenger — le groupe vote.';
    }
    $('btn-force-resolve').style.display = s.isHost ? 'inline-flex' : 'none';
  }

  renderScores($('live-scores'), s.players);
}

function renderEnd(s) {
  const top = s.ranking?.[0];
  const leaders = (s.ranking || []).filter((p) => p.score === (top?.score || 0));
  $('end-trophy').textContent = leaders.length > 1 ? '🤝' : '🏆';
  $('end-title').textContent = leaders.length > 1
    ? `Égalité : ${leaders.map((p) => p.name).join(', ')}`
    : `${top?.name || 'Gagnant'} remporte la partie !`;
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
    showScreen('screen-lobby');
    renderLobby(s);
  } else if (s.phase === 'bidding' || s.phase === 'action' || s.phase === 'voting') {
    showScreen('screen-game');
    renderGame(s);
  } else if (s.phase === 'end') {
    stopSmoothTimer();
    showScreen('screen-end');
    renderEnd(s);
  }
}

socket.on('connect', () => {
  $('connection-status').textContent = '● Connecté';
  $('connection-status').classList.remove('offline');
});

socket.on('disconnect', () => {
  $('connection-status').textContent = '● Déconnecté — reconnexion…';
  $('connection-status').classList.add('offline');
});

socket.on('room-state', applyState);

socket.on('left-room', () => {
  state = null;
  window.location.href = '/';
});

socket.on('error-msg', (msg) => showToast(msg));

$('btn-show-join').addEventListener('click', () => {
  $('join-panel').style.display = 'block';
});

$('btn-create').addEventListener('click', () => {
  socket.emit('create-room', { playerName: getPlayerName(), gameId: GAME_ID });
});

$('btn-join').addEventListener('click', () => {
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length < 4) {
    showToast('Entrez un code de salle valide');
    return;
  }
  socket.emit('join-room', { code, playerName: getPlayerName(), gameId: GAME_ID });
});

$('join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-join').click();
});

$('btn-copy-code').addEventListener('click', async () => {
  if (!state?.code) return;
  await navigator.clipboard.writeText(state.code);
  showToast('Code copié !');
});

$('btn-copy-link').addEventListener('click', async () => {
  if (!state?.code) return;
  const url = `${location.origin}${GAME_PATH}?room=${state.code}`;
  await navigator.clipboard.writeText(url);
  showToast('Lien copié !');
});

$('btn-menu').addEventListener('click', leaveToMenu);
$('btn-salon').addEventListener('click', backToSalon);
$('btn-replay-menu').addEventListener('click', leaveToMenu);

$('set-bid-duration').addEventListener('change', pushSettings);
$('set-round-count').addEventListener('change', pushSettings);

$('btn-start-game').addEventListener('click', () => {
  pushSettings();
  socket.emit('qdm-start-game');
});

$('btn-bid-plus1').addEventListener('click', () => {
  const next = (state?.currentBid || 0) + 1;
  $('bid-input').value = String(next);
  socket.emit('qdm-place-bid', { value: next });
});

$('btn-place-bid').addEventListener('click', () => {
  const value = parseInt($('bid-input').value, 10);
  socket.emit('qdm-place-bid', { value });
});

$('bid-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-place-bid').click();
});

$('btn-go-vote').addEventListener('click', () => socket.emit('qdm-go-to-vote'));
$('btn-vote-yes').addEventListener('click', () => socket.emit('qdm-cast-vote', { success: true }));
$('btn-vote-no').addEventListener('click', () => socket.emit('qdm-cast-vote', { success: false }));
$('btn-force-resolve').addEventListener('click', () => socket.emit('qdm-host-force-resolve'));
$('btn-rematch').addEventListener('click', () => socket.emit('qdm-rematch'));
$('btn-end-lobby').addEventListener('click', () => socket.emit('qdm-back-to-lobby'));

const urlParams = new URLSearchParams(location.search);
const roomFromUrl = urlParams.get('room');
if (roomFromUrl) {
  $('join-code').value = roomFromUrl.toUpperCase();
  $('join-panel').style.display = 'block';
}

$('player-name').placeholder = ['Alex', 'Sam', 'Jordan', 'Charlie', 'Lou'][Math.floor(Math.random() * 5)];
