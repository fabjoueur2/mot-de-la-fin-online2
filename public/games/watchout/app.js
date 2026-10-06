/* WatchOut client */
const GAME_ID = 'watchout';
const GAME_PATH = '/games/watchout/';
const socket = io({ transports: ['websocket', 'polling'] });

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

let state = null;
let ytPlayer = null;
let ytReady = false;
let currentVideoId = null;
let timerInterval = null;

window.onYouTubeIframeAPIReady = () => {
  ytReady = true;
  if (state?.phase === 'watching' && state.myVideoId) mountWatchPlayer(state.myVideoId);
};

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

function fmtMs(ms) {
  const s = Math.max(0, Math.ceil((ms || 0) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`;
}

function tickTimers() {
  if (!state?.phaseEndsAt) return;
  const left = Math.max(0, state.phaseEndsAt - Date.now());
  const map = {
    role_reveal: 'role-timer',
    watching: 'watch-timer',
    discussion: 'disc-timer',
    voting: 'vote-timer',
    tie_break: 'vote-timer'
  };
  const id = map[state.phase];
  if (id && $(id)) $(id).textContent = fmtMs(left);
}

function destroyPlayer() {
  try {
    ytPlayer?.destroy?.();
  } catch {
    /* */
  }
  ytPlayer = null;
  currentVideoId = null;
  const mount = $('yt-mount');
  if (mount) mount.innerHTML = '';
}

function mountWatchPlayer(videoId) {
  if (!videoId) return;
  if (currentVideoId === videoId && ytPlayer) return;
  destroyPlayer();
  currentVideoId = videoId;
  $('watch-wait').style.display = 'none';
  $('yt-mount').innerHTML = '';

  if (!ytReady || typeof YT === 'undefined' || !YT.Player) {
    // Fallback iframe
    $('yt-mount').innerHTML = `<iframe
      src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&modestbranding=1&controls=1&fs=0&iv_load_policy=3&disablekb=1"
      allow="autoplay; encrypted-media"
      allowfullscreen
      title="WatchOut"></iframe>`;
    return;
  }

  const host = document.createElement('div');
  host.id = 'yt-player-host';
  host.style.width = '100%';
  host.style.height = '100%';
  $('yt-mount').appendChild(host);

  ytPlayer = new YT.Player('yt-player-host', {
    videoId,
    width: '100%',
    height: '100%',
    playerVars: {
      autoplay: 1,
      rel: 0,
      modestbranding: 1,
      controls: 1,
      fs: 0,
      iv_load_policy: 3,
      disablekb: 1,
      playsinline: 1
    },
    events: {
      onStateChange(e) {
        if (e.data === YT.PlayerState.ENDED) {
          $('watch-wait').style.display = 'grid';
        }
      }
    }
  });
}

function mountRevealIframe(containerId, videoId) {
  const el = $(containerId);
  if (!el) return;
  if (!videoId) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<iframe
    src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1"
    allow="encrypted-media"
    allowfullscreen
    title="reveal"></iframe>`;
}

function renderCategories(available, selected) {
  const box = $('set-categories');
  if (!box) return;
  const sel = new Set(selected || available);
  box.innerHTML = (available || [])
    .map(
      (c) => `<label><input type="checkbox" value="${c}" ${sel.has(c) ? 'checked' : ''}> ${c}</label>`
    )
    .join('');
}

function pushSettings() {
  if (!state?.isHost || state.phase !== 'lobby') return;
  const cats = [...document.querySelectorAll('#set-categories input:checked')].map((i) => i.value);
  socket.emit('wo-update-settings', {
    roundCount: parseInt($('set-rounds').value, 10),
    maxVideoSec: parseInt($('set-max-video').value, 10),
    discussionSec: parseInt($('set-discussion').value, 10),
    voteSec: parseInt($('set-vote').value, 10),
    difficulty: $('set-difficulty').value,
    categories: cats
  });
}

function renderChat(targetId, messages) {
  const el = $(targetId);
  if (!el) return;
  el.innerHTML = (messages || [])
    .map((m) => `<div class="wo-chat-line"><span class="who">${escapeHtml(m.name)}</span> ${escapeHtml(m.text)}</div>`)
    .join('');
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderVoteList() {
  const box = $('vote-list');
  if (!box || !state) return;
  const tie = state.tieCandidates;
  const targets = state.players.filter((p) => {
    if (p.id === state.myId) return false;
    if (tie?.length) return tie.includes(p.id);
    return true;
  });
  box.innerHTML = targets
    .map((p) => {
      const selected = state.myVote === p.id ? 'selected' : '';
      const disabled = state.phase === 'tie_break' ? 'disabled' : '';
      return `<button type="button" class="wo-vote-btn ${selected}" data-id="${p.id}" ${disabled}>${escapeHtml(p.name)}${p.hasVoted ? ' · ✓' : ''}</button>`;
    })
    .join('');
  box.querySelectorAll('.wo-vote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.phase !== 'voting') return;
      socket.emit('wo-vote', { targetId: btn.dataset.id });
    });
  });
}

function render(s) {
  state = s;
  $('room-nav').style.display = s.phase === 'lobby' || s.phase === 'game_over' ? 'flex' : 'none';

  if (s.phase === 'lobby') {
    destroyPlayer();
    showScreen('screen-lobby');
    $('lobby-code').textContent = s.code;
    $('lobby-player-count').textContent = `(${s.players.length}/${s.maxPlayers})`;
    $('lobby-players').innerHTML = s.players
      .map((p) => `<li>${escapeHtml(p.name)}${p.isHost ? ' · hôte' : ''} · ${p.score} pts</li>`)
      .join('');
    $('lobby-min-hint').textContent = `Minimum ${s.minPlayers} joueurs pour lancer.`;
    $('host-settings').style.display = s.isHost ? 'block' : 'none';
    if (s.isHost) {
      $('set-rounds').value = String(s.settings.roundCount);
      $('set-max-video').value = String(s.settings.maxVideoSec);
      $('set-discussion').value = String(s.settings.discussionSec);
      $('set-vote').value = String(s.settings.voteSec);
      $('set-difficulty').value = s.settings.difficulty;
      renderCategories(s.categoriesAvailable, s.settings.categories);
    }
    return;
  }

  if (s.phase === 'role_reveal') {
    destroyPlayer();
    showScreen('screen-role');
    $('role-round').textContent = `${s.currentRound}/${s.roundCount}`;
    const card = document.querySelector('.wo-role-card');
    card.classList.toggle('impostor', s.myRole === 'impostor');
    card.classList.toggle('crew', s.myRole === 'crew');
    if (s.myRole === 'impostor') {
      $('role-title').textContent = 'Tu es l’IMPOSTEUR';
      $('role-desc').textContent =
        'Tu vas regarder une autre vidéo. Écoute les autres, bluffe, ne te fais pas griller.';
    } else {
      $('role-title').textContent = 'Tu es CREW';
      $('role-desc').textContent =
        'Tout le monde (sauf un) voit la même vidéo. Trouvez l’Imposteur sans trop révéler.';
    }
    return;
  }

  if (s.phase === 'watching') {
    showScreen('screen-watch');
    const badge = $('watch-role-badge');
    badge.textContent = s.myRole === 'impostor' ? 'Imposteur' : 'Crew';
    badge.className = `wo-badge ${s.myRole === 'impostor' ? 'impostor' : 'crew'}`;
    if (s.myVideoId) mountWatchPlayer(s.myVideoId);
    return;
  }

  if (s.phase === 'discussion') {
    destroyPlayer();
    showScreen('screen-discussion');
    renderChat('chat-log', s.chat);
    $('btn-skip-disc').style.display = s.isHost ? 'inline-block' : 'none';
    return;
  }

  if (s.phase === 'voting' || s.phase === 'tie_break') {
    destroyPlayer();
    showScreen('screen-voting');
    $('vote-title').textContent =
      s.phase === 'tie_break'
        ? 'Égalité — 30s de défense, puis re-vote'
        : 'Who watched the wrong video?';
    renderVoteList();
    renderChat('vote-chat-log', s.chat);
    return;
  }

  if (s.phase === 'reveal') {
    destroyPlayer();
    showScreen('screen-reveal');
    const r = s.roundResults;
    if (r) {
      $('reveal-name').textContent = r.impostorName;
      $('reveal-outcome').textContent = r.accusedCorrect
        ? `Le groupe a accusé ${r.accusedName} — correct !`
        : `Le groupe a accusé ${r.accusedName || 'personne'} — l’Imposteur s’en sort.`;
      mountRevealIframe('reveal-main', r.mainVideoId);
      mountRevealIframe('reveal-imp', r.impostorVideoId);
    }
    $('btn-next').style.display = s.isHost ? 'inline-block' : 'none';
    return;
  }

  if (s.phase === 'scoreboard' || s.phase === 'game_over') {
    destroyPlayer();
    showScreen('screen-score');
    $('score-title').textContent = s.phase === 'game_over' ? 'Partie terminée' : 'Scores';
    $('score-list').innerHTML = (s.ranking || s.players)
      .map((p, i) => `<li><span>#${i + 1} ${escapeHtml(p.name)}</span><strong>${p.score}</strong></li>`)
      .join('');
    const actions = $('score-actions');
    if (s.phase === 'game_over' && s.isHost) {
      actions.innerHTML = `
        <button class="btn btn-primary" id="btn-rematch">Rejouer</button>
        <button class="btn btn-secondary" id="btn-lobby">Retour salon</button>`;
      $('btn-rematch')?.addEventListener('click', () => socket.emit('wo-rematch'));
      $('btn-lobby')?.addEventListener('click', () => socket.emit('wo-back-to-lobby'));
    } else {
      actions.innerHTML = s.isHost
        ? `<button class="btn btn-primary" id="btn-advance">Continuer</button>`
        : '';
      $('btn-advance')?.addEventListener('click', () => socket.emit('wo-skip-phase'));
    }
  }
}

socket.on('connect', () => setStatus('Connecté', true));
socket.on('disconnect', () => setStatus('Déconnecté…', false));
socket.on('error-msg', (msg) => alert(msg || 'Erreur'));
socket.on('left-room', () => {
  state = null;
  destroyPlayer();
  showScreen('screen-home');
});
socket.on('room-state', (s) => {
  if (s.gameId && s.gameId !== GAME_ID) return;
  render(s);
  tickTimers();
});

$('btn-create').addEventListener('click', () => {
  const name = $('player-name').value.trim() || 'Joueur';
  socket.emit('create-room', { playerName: name, gameId: GAME_ID });
});
$('btn-show-join').addEventListener('click', () => {
  $('join-panel').style.display = 'block';
});
$('btn-join').addEventListener('click', () => {
  const name = $('player-name').value.trim() || 'Joueur';
  const code = $('join-code').value.trim().toUpperCase();
  socket.emit('join-room', { code, playerName: name, gameId: GAME_ID });
});
$('btn-start').addEventListener('click', () => {
  pushSettings();
  socket.emit('wo-start-game');
});
['set-rounds', 'set-max-video', 'set-discussion', 'set-vote', 'set-difficulty'].forEach((id) => {
  $(id)?.addEventListener('change', pushSettings);
});
$('set-categories')?.addEventListener('change', pushSettings);

$('chat-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('chat-input').value;
  $('chat-input').value = '';
  socket.emit('wo-chat', { text });
});
$('btn-skip-disc')?.addEventListener('click', () => socket.emit('wo-skip-phase'));
$('btn-next')?.addEventListener('click', () => socket.emit('wo-next-round'));
$('btn-salon')?.addEventListener('click', () => socket.emit('wo-back-to-lobby'));
$('btn-menu')?.addEventListener('click', () => {
  socket.emit('leave-room');
  location.href = '/';
});
$('btn-copy-code')?.addEventListener('click', () => {
  if (state?.code) navigator.clipboard?.writeText(state.code);
});
$('btn-copy-link')?.addEventListener('click', () => {
  if (state?.code) {
    const url = `${location.origin}${GAME_PATH}?room=${state.code}`;
    navigator.clipboard?.writeText(url);
  }
});

if (params.get('room')) {
  $('join-panel').style.display = 'block';
  $('join-code').value = params.get('room').toUpperCase();
}

setInterval(tickTimers, 250);
