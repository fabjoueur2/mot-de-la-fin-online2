const GAME_ID = 'animal-stacker';
const GAME_PATH = '/games/animal-stacker/';
const socket = io({ transports: ['websocket', 'polling'] });

let state = null;
const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const ctx = canvas.getContext('2d');

let localAimX = 260;
let localAimAngle = 0;
let dragging = false;
const ROT_STEP = Math.PI / 8;

/** Buffer de frames serveur + rendu interpolé */
let poseBuffer = [];
let renderPoses = [];
let physicsStreaming = false;
let endLerp = null;
let rafId = null;
let lastDropId = 0;
const RENDER_DELAY_MS = 70;
const END_LERP_MS = 140;
const MAX_POSE_BUFFER = 24;

const DIFFICULTY_HINTS = {
  facile: 'Plateforme large, gravité douce — idéal pour débuter.',
  normal: 'Plateforme standard, gravité équilibrée.',
  corse: 'Plateforme étroite, gravité forte — chaque placement compte !'
};

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
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
  stopRenderLoop();
  socket.emit('leave-room');
  state = null;
  window.location.href = '/';
}

function backToSalon() {
  if (!state?.isHost) {
    showToast('Seul l\'hôte peut ramener au salon.');
    return;
  }
  socket.emit('as-back-to-lobby');
}

function clientXToWorld(clientX) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width * canvas.width;
  const w = state?.world || { minX: 70, maxX: 330 };
  return Math.max(w.minX, Math.min(w.maxX, x));
}

function isInputLocked() {
  return physicsStreaming || Boolean(endLerp);
}

function setGameControlsLocked(locked) {
  const disabled = locked || !state?.canControl;
  $('btn-drop').disabled = disabled;
  $('btn-rotate-left').disabled = disabled;
  $('btn-rotate-right').disabled = disabled;
  const wheel = $('rotate-wheel');
  if (wheel) wheel.classList.toggle('locked', disabled);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function poseKey(p) {
  return `${p.type}|${p.id ?? ''}`;
}

function lerpPoseLists(fromList, toList, t) {
  const fromMap = new Map((fromList || []).map(p => [poseKey(p), p]));
  const toMap = new Map((toList || []).map(p => [poseKey(p), p]));
  const keys = new Set([...fromMap.keys(), ...toMap.keys()]);
  const out = [];
  for (const key of keys) {
    const a = fromMap.get(key);
    const b = toMap.get(key);
    if (a && b) {
      out.push({
        id: b.id ?? a.id,
        type: b.type,
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        angle: lerpAngle(a.angle, b.angle, t),
        fallen: b.fallen || a.fallen ? 1 : 0
      });
    } else if (b && t > 0.5) {
      out.push({ ...b });
    } else if (a && t < 0.5) {
      out.push({ ...a });
    } else if (b) {
      out.push({ ...b });
    }
  }
  return out;
}

function clearPoseStream() {
  poseBuffer = [];
  endLerp = null;
  physicsStreaming = false;
}

function pushPoseFrame(poses) {
  poseBuffer.push({
    t: performance.now(),
    poses: (poses || []).map(p => ({ ...p }))
  });
  while (poseBuffer.length > MAX_POSE_BUFFER) poseBuffer.shift();
}

function updateInterpolatedPoses() {
  if (endLerp) {
    const u = Math.min(1, (performance.now() - endLerp.start) / endLerp.duration);
    const eased = u * u * (3 - 2 * u);
    renderPoses = lerpPoseLists(endLerp.from, endLerp.to, eased);
    if (u >= 1) {
      renderPoses = endLerp.to.map(p => ({ ...p }));
      endLerp = null;
      physicsStreaming = false;
      poseBuffer = [];
      if (state?.phase === 'end') {
        stopRenderLoop();
        showScreen('screen-end');
        renderEnd(state);
      } else if (state?.phase === 'playing') {
        setGameControlsLocked(false);
        renderGame(state);
      }
    }
    return;
  }

  if (!physicsStreaming) {
    renderPoses = (state?.stack || []).map(p => ({ ...p, fallen: 0 }));
    return;
  }

  if (poseBuffer.length === 0) return;
  if (poseBuffer.length === 1) {
    renderPoses = poseBuffer[0].poses;
    return;
  }

  const targetT = performance.now() - RENDER_DELAY_MS;
  while (poseBuffer.length >= 2 && poseBuffer[1].t <= targetT) {
    poseBuffer.shift();
  }

  if (poseBuffer.length === 1) {
    renderPoses = poseBuffer[0].poses;
    return;
  }

  const a = poseBuffer[0];
  const b = poseBuffer[1];
  const span = Math.max(1, b.t - a.t);
  const u = Math.max(0, Math.min(1, (targetT - a.t) / span));
  renderPoses = lerpPoseLists(a.poses, b.poses, u);
}

function startRenderLoop() {
  if (rafId) return;
  const loop = () => {
    rafId = requestAnimationFrame(loop);
    if (!state || state.phase !== 'playing') return;
    updateInterpolatedPoses();
    drawScene();
  };
  rafId = requestAnimationFrame(loop);
}

function stopRenderLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function drawBackgroundAndPlatform(w) {
  ctx.fillStyle = '#5bc0eb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const px = w.platform.x;
  const py = w.platform.y;
  const pw = w.platform.width;
  const ph = w.platform.height;

  ctx.fillStyle = '#6bcb77';
  ctx.fillRect(px - pw / 2, py - ph / 2, pw, ph);
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 3;
  ctx.strokeRect(px - pw / 2, py - ph / 2, pw, ph);
}

function drawScene() {
  if (!state || state.phase !== 'playing') return;
  const w = state.world;
  drawBackgroundAndPlatform(w);

  const poses = renderPoses.length ? renderPoses : (state.stack || []);
  poses.forEach((piece) => {
    const alpha = piece.fallen ? 0.85 : 1;
    drawAnimal(ctx, piece.type, piece.x, piece.y, piece.angle, alpha);
  });

  if (state.currentAnimal && !physicsStreaming && !endLerp) {
    const ax = state.canControl ? localAimX : state.aimX;
    const aa = state.canControl ? localAimAngle : state.aimAngle;
    const dropY = w.dropY || 100;
    drawAnimal(ctx, state.currentAnimal.type, ax, dropY, aa, state.canControl ? 0.95 : 0.7);

    if (state.canControl) {
      ctx.strokeStyle = 'rgba(255,255,255,.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(ax, dropY, 42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function beginPhysicsStream(dropId) {
  physicsStreaming = true;
  endLerp = null;
  poseBuffer = [];
  lastDropId = dropId || lastDropId;
  setGameControlsLocked(true);
  if (state) {
    $('turn-bar').textContent = 'Chute en cours…';
    $('hud-score').textContent = String(state.stackHeight ?? state.stack?.length ?? 0);
  }
  startRenderLoop();
}

function finishPhysicsStream({ fallen, stack }) {
  const finalStack = (stack || state?.stack || []).map(p => ({ ...p, fallen: 0 }));
  const from = renderPoses.length
    ? renderPoses.map(p => ({ ...p }))
    : finalStack.map(p => ({ ...p }));

  endLerp = {
    from,
    to: finalStack,
    start: performance.now(),
    duration: END_LERP_MS
  };
  poseBuffer = [];

  if (fallen) {
    $('turn-bar').textContent = 'Chute !';
  }
}

function rotateAnimal(direction) {
  if (!state?.canControl || isInputLocked()) return;
  localAimAngle += direction === 'left' ? -ROT_STEP : ROT_STEP;
  socket.emit('as-rotate', { direction });
}

function syncAimFromState() {
  if (!state) return;
  if (state.canControl && !isInputLocked()) return;
  localAimX = state.aimX ?? 260;
  localAimAngle = state.aimAngle ?? 0;
}

function pushSettings() {
  if (!state?.isHost) return;
  const difficulty = document.querySelector('.as-diff-btn.active')?.dataset.difficulty || 'normal';
  const roundsToWin = parseInt(document.querySelector('.as-round-btn.active')?.dataset.rounds || '3', 10);
  socket.emit('as-update-settings', { difficulty, roundsToWin });
}

function syncSettingsUI(s) {
  const difficulty = s.settings?.difficulty || 'normal';
  const roundsToWin = s.settings?.roundsToWin ?? 3;
  document.querySelectorAll('.as-diff-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.difficulty === difficulty);
  });
  document.querySelectorAll('.as-round-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.rounds, 10) === roundsToWin);
  });
  const hint = $('difficulty-hint');
  if (hint) hint.textContent = DIFFICULTY_HINTS[difficulty] || DIFFICULTY_HINTS.normal;
}

function renderLobby(s) {
  stopRenderLoop();
  clearPoseStream();
  $('lobby-code').textContent = s.code;
  $('host-settings').style.display = s.isHost ? 'block' : 'none';
  $('guest-wait').style.display = s.isHost ? 'none' : 'block';

  if (s.isHost && s.teams) {
    $('team-name-0').value = s.teams[0]?.name || 'Équipe 1';
    $('team-name-1').value = s.teams[1]?.name || 'Équipe 2';
    syncSettingsUI(s);
  } else if (s.settings) {
    const diffLabel = { facile: 'Facile', normal: 'Normal', corse: 'Corsé' }[s.settings.difficulty] || 'Normal';
    $('guest-wait').innerHTML = `<p style="color:var(--as-muted);">En attente de l'hôte…</p>
      <p class="as-setting-hint">Difficulté : ${diffLabel} · ${s.settings.roundsToWin} manche(s) à gagner</p>`;
  }

  const me = s.players.find(p => p.isYou);
  if (me) $('my-team-select').value = me.teamIndex;

  $('players-list').innerHTML = s.players.map(p => `
    <li>
      <span>
        <span class="name">${p.name}</span>
        ${p.isYou ? '<span class="you"> (vous)</span>' : ''}
        ${p.id === s.hostId ? ' 👑' : ''}
      </span>
      ${s.isHost ? `
        <select class="assign-team" data-player="${p.id}">
          <option value="0" ${p.teamIndex === 0 ? 'selected' : ''}>${s.teams[0]?.name}</option>
          <option value="1" ${p.teamIndex === 1 ? 'selected' : ''}>${s.teams[1]?.name}</option>
        </select>
      ` : `<span style="color:${s.teams[p.teamIndex]?.color};font-weight:600;font-size:.85rem">${s.teams[p.teamIndex]?.name}</span>`}
    </li>
  `).join('');

  document.querySelectorAll('.assign-team').forEach(sel => {
    sel.addEventListener('change', () => {
      socket.emit('as-assign-team', {
        playerId: sel.dataset.player,
        teamIndex: parseInt(sel.value)
      });
    });
  });
}

function renderTeamPills(s) {
  const el = $('team-pills');
  if (!el || !s.teams) return;
  const target = s.settings?.roundsToWin ?? 1;
  el.innerHTML = s.teams.map((t, i) => `
    <div class="as-team-pill${i === s.currentTeamIndex && s.phase === 'playing' ? ' active' : ''}"
         style="color:${t.color}">${t.name} · ${t.score}/${target}</div>
  `).join('');
}

function renderGame(s) {
  renderTeamPills(s);
  $('hud-score').textContent = String(s.stackHeight ?? s.stack?.length ?? 0);

  const team = s.teams[s.currentTeamIndex];
  const wheel = $('rotate-wheel');
  if (physicsStreaming || endLerp) {
    $('turn-bar').textContent = s.lastDrop?.fallen ? 'Chute !' : 'Chute en cours…';
    $('rotate-hint').style.display = 'none';
    if (wheel) wheel.style.display = 'none';
  } else if (s.canControl) {
    $('turn-bar').textContent = `À vous ! — ${s.currentAnimal?.name || 'Animal'}`;
    $('rotate-hint').style.display = 'block';
    if (wheel) wheel.style.display = 'flex';
  } else if (s.isYourTeamTurn) {
    $('turn-bar').textContent = `Tour de ${team?.name} — un coéquipier joue`;
    $('rotate-hint').style.display = 'none';
    if (wheel) wheel.style.display = 'none';
  } else {
    $('turn-bar').textContent = `Tour de ${team?.name}…`;
    $('rotate-hint').style.display = 'none';
    if (wheel) wheel.style.display = 'none';
  }

  setGameControlsLocked(isInputLocked());
  if (!s.canControl || isInputLocked()) syncAimFromState();
  else if (localAimX == null) syncAimFromState();

  if (!physicsStreaming && !endLerp) {
    renderPoses = (s.stack || []).map(p => ({ ...p, fallen: 0 }));
  }
  startRenderLoop();
}

function renderEnd(s) {
  stopRenderLoop();
  clearPoseStream();
  const roundsToWin = s.settings?.roundsToWin ?? 1;
  const roundWinner = s.teams[s.winnerTeamIndex];

  if (s.matchOver) {
    const matchWinner = s.teams[s.matchWinnerTeamIndex];
    $('end-trophy').textContent = '🏆';
    $('end-title').textContent = `${matchWinner?.name || 'Équipe'} remporte la partie !`;
    $('end-subtitle').textContent = s.lastDrop?.fallen
      ? 'Un animal est tombé — chute fatale sur la dernière manche !'
      : `Score final : ${s.teams.map(t => t.score).join(' – ')}`;
  } else {
    $('end-trophy').textContent = '✨';
    $('end-title').textContent = `${roundWinner?.name || 'Équipe'} remporte la manche ${s.roundNumber} !`;
    $('end-subtitle').textContent = s.lastDrop?.fallen
      ? 'Un animal est tombé — chute fatale !'
      : '';
  }

  $('scores-end').innerHTML = s.teams.map((t, i) => {
    const highlight = s.matchOver
      ? i === s.matchWinnerTeamIndex
      : i === s.winnerTeamIndex;
    return `
    <div class="as-team-pill${highlight ? ' active' : ''}" style="color:${t.color}">
      ${t.name} · ${t.score}/${roundsToWin}
    </div>
  `;
  }).join('');

  const matchInfo = $('end-match-info');
  if (s.matchOver) {
    matchInfo.textContent = 'Partie terminée — rejouez une nouvelle série de manches ou retournez au salon.';
  } else {
    const need = roundsToWin - (roundWinner?.score || 0);
    matchInfo.textContent = need > 0
      ? `${roundWinner?.name} a besoin de ${need} victoire${need > 1 ? 's' : ''} de plus pour gagner la partie.`
      : '';
  }

  const showHost = s.isHost;
  $('btn-next-round').style.display = showHost && !s.matchOver ? 'inline-flex' : 'none';
  $('btn-replay').style.display = showHost && s.matchOver ? 'inline-flex' : 'none';
}

function applyState(s) {
  if (!s) return;

  if (s.phase === 'lobby') {
    clearPoseStream();
    lastDropId = 0;
  }

  if (s.physicsStreaming && !physicsStreaming) {
    beginPhysicsStream(s.lastDrop?.id);
  }

  if (s.lastDrop?.id) lastDropId = Math.max(lastDropId, s.lastDrop.id);

  state = s;

  if (s.phase === 'lobby') {
    showScreen('screen-lobby');
    renderLobby(s);
  } else if (s.phase === 'playing') {
    showScreen('screen-game');
    renderGame(s);
  } else if (s.phase === 'end') {
    // Laisser finir le lerp éventuel avant l'écran de fin
    if (!physicsStreaming && !endLerp) {
      showScreen('screen-end');
      renderEnd(s);
    } else {
      showScreen('screen-game');
      renderTeamPills(s);
      $('turn-bar').textContent = 'Chute !';
      setGameControlsLocked(true);
      startRenderLoop();
    }
  }
}

function pushTeamNames() {
  if (!state?.isHost) return;
  socket.emit('as-update-teams', {
    teamNames: [$('team-name-0').value, $('team-name-1').value]
  });
}

// Socket
preloadAnimalSprites();

socket.on('connect', () => {
  $('connection-status').textContent = '● Connecté';
  $('connection-status').classList.remove('offline');
});
socket.on('disconnect', () => {
  $('connection-status').textContent = '● Déconnecté';
  $('connection-status').classList.add('offline');
});
socket.on('room-state', applyState);
socket.on('left-room', () => { window.location.href = '/'; });
socket.on('error-msg', showToast);

socket.on('as-drop-started', (payload) => {
  if (!payload) return;
  beginPhysicsStream(payload.dropId);
  if (state) {
    state = {
      ...state,
      physicsStreaming: true,
      stackSettling: true,
      currentAnimal: null,
      lastDrop: {
        id: payload.dropId,
        type: payload.type,
        x: payload.x,
        angle: payload.angle,
        fallen: false,
        stackBefore: payload.stackBefore || state.stack
      }
    };
    renderTeamPills(state);
  }
});

socket.on('as-physics-frame', (frame) => {
  if (!frame || !Array.isArray(frame.poses)) return;
  if (frame.dropId && lastDropId && frame.dropId < lastDropId) return;
  if (!physicsStreaming) beginPhysicsStream(frame.dropId);
  pushPoseFrame(frame.poses);
  if (state) {
    $('hud-score').textContent = String(frame.poses.filter(p => !p.fallen).length);
  }
});

socket.on('as-physics-end', (payload) => {
  if (!payload) return;
  if (payload.stack && state) {
    state = {
      ...state,
      stack: payload.stack,
      stackSettling: false,
      physicsStreaming: false,
      stackHeight: payload.stack.length
    };
    if (payload.fallen && state.lastDrop) {
      state.lastDrop = { ...state.lastDrop, fallen: true };
    }
  }
  finishPhysicsStream({
    fallen: Boolean(payload.fallen),
    stack: payload.stack
  });
});

// UI
$('btn-show-join').addEventListener('click', () => { $('join-panel').style.display = 'block'; });
$('btn-create').addEventListener('click', () => {
  socket.emit('create-room', { playerName: getPlayerName(), gameId: GAME_ID });
});
$('btn-join').addEventListener('click', () => {
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length < 4) return showToast('Code invalide');
  socket.emit('join-room', { code, playerName: getPlayerName(), gameId: GAME_ID });
});
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
$('my-team-select').addEventListener('change', () => {
  socket.emit('as-set-team', { teamIndex: parseInt($('my-team-select').value) });
});
$('team-name-0').addEventListener('change', pushTeamNames);
$('team-name-1').addEventListener('change', pushTeamNames);

document.querySelectorAll('.as-diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!state?.isHost) return;
    document.querySelectorAll('.as-diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const hint = $('difficulty-hint');
    if (hint) hint.textContent = DIFFICULTY_HINTS[btn.dataset.difficulty] || DIFFICULTY_HINTS.normal;
    pushSettings();
  });
});

document.querySelectorAll('.as-round-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!state?.isHost) return;
    document.querySelectorAll('.as-round-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pushSettings();
  });
});
$('btn-start-game').addEventListener('click', () => {
  pushTeamNames();
  pushSettings();
  socket.emit('as-start-game');
});
$('btn-next-round').addEventListener('click', () => socket.emit('as-next-round'));
$('btn-replay').addEventListener('click', () => socket.emit('as-rematch'));
$('btn-menu').addEventListener('click', leaveToMenu);
$('btn-salon').addEventListener('click', backToSalon);
$('btn-replay-menu').addEventListener('click', leaveToMenu);
$('btn-exit-game').addEventListener('click', leaveToMenu);

$('btn-drop').addEventListener('click', () => {
  if (!state?.canControl || isInputLocked()) return;
  socket.emit('as-update-aim', { x: localAimX, angle: localAimAngle });
  setGameControlsLocked(true);
  $('turn-bar').textContent = 'Chute en cours…';
  socket.emit('as-drop');
});

$('btn-rotate-left').addEventListener('click', () => rotateAnimal('left'));
$('btn-rotate-right').addEventListener('click', () => rotateAnimal('right'));

function emitAim() {
  if (!state?.canControl || isInputLocked()) return;
  socket.emit('as-update-aim', { x: localAimX, angle: localAimAngle });
}

canvas.addEventListener('pointerdown', (e) => {
  if (!state?.canControl || isInputLocked()) return;
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
  localAimX = clientXToWorld(e.clientX);
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging || !state?.canControl || isInputLocked()) return;
  localAimX = clientXToWorld(e.clientX);
});

canvas.addEventListener('pointerup', () => {
  if (!dragging) return;
  dragging = false;
  if (!isInputLocked()) emitAim();
});

window.addEventListener('resize', () => {
  if (state?.phase === 'playing') drawScene();
});

const urlParams = new URLSearchParams(location.search);
const roomFromUrl = urlParams.get('room');
if (roomFromUrl) {
  $('join-code').value = roomFromUrl.toUpperCase();
  $('join-panel').style.display = 'block';
}

const names = ['Joueur', 'Empileur', 'Champion', 'Zoo', 'Stacker'];
$('player-name').placeholder = names[Math.floor(Math.random() * names.length)];
