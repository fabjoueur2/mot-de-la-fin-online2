const socket = io({ transports: ['websocket', 'polling'] });

let state = null;
let selectedDifficulty = 'mixte';

const $ = (id) => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  const inRoom = id !== 'screen-home';
  const inLobby = id === 'screen-lobby';
  $('room-nav').style.display = inRoom ? 'flex' : 'none';
  $('btn-salon').style.display = inRoom && !inLobby ? 'block' : 'none';
}

function leaveToMenu() {
  socket.emit('leave-room');
  state = null;
  showScreen('screen-home');
}

function backToSalon() {
  if (!state?.isHost) {
    showToast('Seul l\'hôte peut ramener tout le monde au salon.');
    return;
  }
  socket.emit('back-to-lobby');
}

function roleLabel(role) {
  return role === 'maitre' ? '👑 Maître' : '🎯 Devineur';
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

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function getPlayerName() {
  return ($('player-name').value || 'Joueur').trim().slice(0, 20) || 'Joueur';
}

function renderScores(containerId, teams, currentTeamIndex, teamTimers) {
  const el = $(containerId);
  const cols = Math.min(teams.length, 4);
  el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  el.innerHTML = teams.map((t, i) => {
    const timerHtml = teamTimers
      ? `<div class="team-timer" style="font-family:'JetBrains Mono',monospace;font-size:.8rem;color:${i === currentTeamIndex ? 'var(--accent2)' : 'var(--muted)'};margin-top:6px;">⏱ ${formatTime(teamTimers[i] ?? 0)}</div>`
      : '';
    return `
    <div class="score-box${i === currentTeamIndex ? ' active-team' : ''}" style="border:2px solid ${t.color}33">
      <div class="team-name">${t.name}${i === currentTeamIndex ? ' ▶' : ''}</div>
      <div class="pts" style="color:${t.color}">${t.score}</div>
      ${timerHtml}
    </div>
  `;
  }).join('');
}

function updateClueTracker(clue) {
  document.querySelectorAll('.clue-dot').forEach(dot => {
    const n = parseInt(dot.dataset.clue);
    dot.classList.remove('active', 'done');
    if (n <= clue) dot.classList.add('done');
    else if (n === clue + 1) dot.classList.add('active');
  });
}

function pushSettings() {
  if (!state?.isHost) return;
  const teamCount = parseInt($('set-team-count').value) || 2;
  const teamNames = [...document.querySelectorAll('.team-name-host')].map(i => i.value);
  socket.emit('update-settings', {
    teamCount,
    timerDuration: parseInt($('set-timer').value) || 60,
    difficulty: selectedDifficulty,
    teamNames
  });
}

function renderHostTeamNames(teams) {
  const container = $('team-names-host');
  const existing = [...container.querySelectorAll('.team-name-host')].map(i => i.value);
  container.innerHTML = teams.map((t, i) => `
    <div>
      <label style="color:${t.color}">Équipe ${i + 1}</label>
      <input type="text" class="team-name-host" value="${existing[i] || t.name}" maxlength="20">
    </div>
  `).join('');
  container.querySelectorAll('.team-name-host').forEach(inp => {
    inp.addEventListener('change', pushSettings);
  });
}

function renderLobby(s) {
  $('lobby-code').textContent = s.code;
  $('host-settings').style.display = s.isHost ? 'block' : 'none';
  $('guest-wait').style.display = s.isHost ? 'none' : 'block';

  if (s.isHost) {
    $('set-team-count').value = s.settings.teamCount;
    $('set-timer').value = s.settings.timerDuration;
    selectedDifficulty = s.settings.difficulty;
    document.querySelectorAll('.diff-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.diff === selectedDifficulty);
    });
    renderHostTeamNames(s.teams);
  }

  const myTeam = $('my-team-select');
  myTeam.innerHTML = s.teams.map((t, i) =>
    `<option value="${i}">${t.name}</option>`
  ).join('');
  const me = s.players.find(p => p.isYou);
  if (me) myTeam.value = me.teamIndex;

  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.classList.toggle('active', me && btn.dataset.role === (me.role || 'devineur'));
  });

  const list = $('players-list');
  list.innerHTML = s.players.map(p => `
    <li>
      <span>
        <span class="name">${p.name}</span>
        <span class="player-role-tag ${p.role || 'devineur'}">${roleLabel(p.role || 'devineur')}</span>
        ${p.isYou ? '<span class="you"> (vous)</span>' : ''}
        ${p.id === s.hostId ? ' 👑' : ''}
      </span>
      ${s.isHost ? `
        <select class="assign-team" data-player="${p.id}">
          ${s.teams.map((t, i) => `<option value="${i}" ${p.teamIndex === i ? 'selected' : ''}>${t.name}</option>`).join('')}
        </select>
      ` : `<span style="color:${s.teams[p.teamIndex]?.color};font-size:.85rem;font-weight:600">${s.teams[p.teamIndex]?.name}</span>`}
    </li>
  `).join('');

  list.querySelectorAll('.assign-team').forEach(sel => {
    sel.addEventListener('change', () => {
      socket.emit('assign-player-team', {
        playerId: sel.dataset.player,
        teamIndex: parseInt(sel.value)
      });
    });
  });

  $('btn-round2').style.display = s.isHost ? 'inline-flex' : 'none';
  $('wait-host-r2').style.display = s.isHost ? 'none' : 'block';
  $('btn-replay').style.display = s.isHost ? 'inline-flex' : 'none';
  $('host-timer-controls').style.display = s.isHost ? 'flex' : 'none';
}

function renderGame(s) {
  const isR1 = s.phase === 'round1';
  const isR2 = s.phase === 'round2';
  const team = s.teams[s.currentTeamIndex];
  const roleLabel = { maitre: '👑 Maître', devineur: '🎯 Devineur', spectator: '👀 Spectateur' };

  $('round-badge').textContent = isR1 ? 'Manche 1 — Le Maître mot' : 'Manche 2 — Mots interdits';
  $('round-badge').className = `round-badge ${isR1 ? 'r1' : 'r2'}`;

  let counterText = `Carte ${s.cardsThisRound} — ${team?.name || ''} · chrono équipe : ${formatTime(s.timeLeft)}`;
  if (s.masterName) {
    const guessers = s.guesserNames?.length ? s.guesserNames.join(', ') : '…';
    counterText = `Carte ${s.cardsThisRound} — ${s.masterName} (Maître) → ${guessers}`;
  }
  $('game-counter').textContent = counterText;

  const duration = s.settings.timerDuration;
  const pct = duration ? (s.timeLeft / duration) * 100 : 0;
  $('timer-fill').style.width = pct + '%';
  const timerEl = $('timer-display');
  timerEl.textContent = formatTime(s.timeLeft);
  timerEl.classList.remove('warning', 'danger');
  if (s.timeLeft <= 10) timerEl.classList.add('danger');
  else if (s.timeLeft <= 20) timerEl.classList.add('warning');

  renderScores('scores-game', s.teams, s.currentTeamIndex, s.teamTimers);

  const wordBox = $('word-box');
  const forbiddenSection = $('forbidden-section');
  const roleBadge = $('role-badge');
  if (roleBadge) {
    roleBadge.textContent = roleLabel[s.role] || '';
    roleBadge.style.display = s.role ? 'inline-block' : 'none';
  }

  if (s.card && s.isMaster) {
    wordBox.classList.remove('waiting', 'guesser-view');
    $('word-text').textContent = s.card.mot;
    const diffEl = $('word-diff');
    diffEl.textContent = s.card.difficulty;
    diffEl.className = 'diff-tag ' + s.card.difficulty;

    if (isR2) {
      forbiddenSection.style.display = 'block';
      $('forbidden-list').innerHTML = s.card.interdits.map(w =>
        `<span class="forbidden-tag">🚫 ${w}</span>`
      ).join('');
    } else {
      forbiddenSection.style.display = 'none';
    }
  } else if (s.isGuesser) {
    wordBox.classList.remove('waiting');
    wordBox.classList.add('guesser-view');
    $('word-text').textContent = isR1
      ? '🎯 Vous êtes le DEVINEUR — ne regardez pas l\'écran du Maître !'
      : '🎯 Vous êtes le DEVINEUR — écoutez les descriptions !';
    $('word-diff').textContent = '';
    forbiddenSection.style.display = 'none';
  } else {
    wordBox.classList.add('waiting');
    wordBox.classList.remove('guesser-view');
    $('word-text').textContent = `👀 ${team?.name || 'Une équipe'} joue — regardez le chrono !`;
    $('word-diff').textContent = '';
    forbiddenSection.style.display = 'none';
  }

  $('r1-controls').style.display = isR1 ? 'block' : 'none';
  $('r2-controls').style.display = isR2 ? 'block' : 'none';

  const showControls = s.isMaster && s.card;
  $('active-team-controls').style.display = showControls && isR1 ? 'flex' : 'none';
  $('active-team-controls-r2').style.display = showControls && isR2 ? 'flex' : 'none';

  const spec = $('spectator-msg');
  if (s.soloTeam && (s.isMaster || s.isGuesser)) {
    spec.style.display = 'block';
    spec.innerHTML = '⚠️ Vous êtes seul dans votre équipe — il faut au moins un <strong>Maître</strong> et un <strong>Devineur</strong> !';
  } else if (s.isGuesser) {
    spec.style.display = 'block';
    spec.innerHTML = isR1
      ? `<strong>${s.masterName}</strong> vous donne des indices (un mot à la fois). Devinez à voix haute — visio conseillée !`
      : `<strong>${s.masterName}</strong> décrit le mot. Devinez sans voir la carte !`;
  } else if (s.isMaster) {
    spec.style.display = 'block';
    spec.innerHTML = isR1
      ? 'Vous êtes le <strong>Maître</strong> pour toute la partie — seul vous voyez le mot. Donnez <strong>un mot</strong> à la fois !'
      : 'Vous êtes le <strong>Maître</strong> pour toute la partie — seul vous voyez le mot et les mots interdits.';
  } else if (s.role === 'spectator') {
    spec.style.display = 'block';
    spec.innerHTML = isR1
      ? `<strong>${team?.name}</strong> joue : ${s.masterName || '…'} fait deviner à ${s.guesserNames?.join(', ') || '…'}.`
      : `<strong>${team?.name}</strong> joue : ${s.masterName || '…'} décrit le mot.`;
  } else {
    spec.style.display = 'none';
  }

  if (isR1) updateClueTracker(s.currentClue);
  $('btn-pause').textContent = s.timerPaused ? '▶ Reprendre' : '⏸ Pause';
}

function renderEnd(s) {
  const max = Math.max(...s.teams.map(t => t.score));
  const winners = s.teams.filter(t => t.score === max);
  $('end-trophy').textContent = winners.length === 1 ? '🏆' : '🤝';
  $('end-title').textContent = winners.length === 1
    ? `${winners[0].name} remporte la partie !`
    : `Égalité : ${winners.map(w => w.name).join(', ')}`;
  $('end-subtitle').textContent = s.teams.map(t => `${t.name} : ${t.score} pts`).join(' · ');
  renderScores('scores-final', s.teams, -1, null);
}

function applyState(s) {
  state = s;
  if (!s) return;

  if (s.phase === 'lobby') {
    showScreen('screen-lobby');
    renderLobby(s);
  } else if (s.phase === 'round1' || s.phase === 'round2') {
    showScreen('screen-game');
    renderGame(s);
  } else if (s.phase === 'transition') {
    showScreen('screen-transition');
    renderScores('scores-transition', s.teams, s.currentTeamIndex, s.teamTimers);
    $('btn-round2').style.display = s.isHost ? 'inline-flex' : 'none';
    $('wait-host-r2').style.display = s.isHost ? 'none' : 'block';
  } else if (s.phase === 'end') {
    showScreen('screen-end');
    renderEnd(s);
    $('btn-replay').style.display = s.isHost ? 'inline-flex' : 'none';
  }
}

// Socket events
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
  showScreen('screen-home');
});

socket.on('error-msg', (msg) => showToast(msg));

// UI events
$('btn-show-join').addEventListener('click', () => {
  $('join-panel').style.display = 'block';
});

$('btn-create').addEventListener('click', () => {
  socket.emit('create-room', { playerName: getPlayerName() });
});

$('btn-join').addEventListener('click', () => {
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length < 4) {
    showToast('Entrez un code de salle valide');
    return;
  }
  socket.emit('join-room', { code, playerName: getPlayerName() });
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
  const url = `${location.origin}?room=${state.code}`;
  await navigator.clipboard.writeText(url);
  showToast('Lien copié !');
});

$('my-team-select').addEventListener('change', () => {
  socket.emit('set-team', { teamIndex: parseInt($('my-team-select').value) });
});

document.querySelectorAll('.role-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    socket.emit('set-role', { role: btn.dataset.role });
  });
});

$('btn-menu').addEventListener('click', leaveToMenu);
$('btn-salon').addEventListener('click', backToSalon);
$('btn-replay-menu').addEventListener('click', leaveToMenu);

$('set-team-count').addEventListener('change', pushSettings);
$('set-timer').addEventListener('change', pushSettings);

document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDifficulty = btn.dataset.diff;
    pushSettings();
  });
});

$('btn-start-game').addEventListener('click', () => {
  pushSettings();
  socket.emit('start-game');
});

$('btn-round2').addEventListener('click', () => socket.emit('start-round2'));
$('btn-replay').addEventListener('click', () => socket.emit('back-to-lobby'));

$('btn-clue').addEventListener('click', () => socket.emit('clue-given'));
$('btn-found').addEventListener('click', () => socket.emit('card-found'));
$('btn-fail').addEventListener('click', () => socket.emit('card-fail'));
$('btn-found-r2').addEventListener('click', () => socket.emit('card-found'));
$('btn-fail-r2').addEventListener('click', () => socket.emit('card-fail'));
$('btn-pause').addEventListener('click', () => socket.emit('pause-timer'));
$('btn-reset-timer').addEventListener('click', () => socket.emit('reset-timer'));

// Auto-join via URL ?room=CODE
const urlParams = new URLSearchParams(location.search);
const roomFromUrl = urlParams.get('room');
if (roomFromUrl) {
  $('join-code').value = roomFromUrl.toUpperCase();
  $('join-panel').style.display = 'block';
}

// Random default name
const names = ['Joueur', 'Maître', 'Devineur', 'Champion', 'Érudit'];
$('player-name').placeholder = names[Math.floor(Math.random() * names.length)];
