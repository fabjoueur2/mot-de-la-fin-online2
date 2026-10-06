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
let revealMainId = null;
let revealImpId = null;
let timerInterval = null;
let reportedVideoEnded = false;
let fallbackEndTimer = null;

const CAT_LABELS = {
  animals: 'Animaux',
  fails: 'Fails',
  sports: 'Sport',
  food: 'Nourriture',
  kids: 'Enfants',
  weird: 'Absurde'
};

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

  if (state.phase === 'watching') {
    const detail = $('watch-wait-detail');
    if (detail && $('watch-wait')?.style.display !== 'none') {
      const done = state.videoEndedCount || 0;
      const total = state.players?.length || 0;
      detail.textContent = `${done}/${total} prêts · suite dans ${fmtMs(left)}`;
    }
  }
}

function reportVideoEnded() {
  if (reportedVideoEnded || state?.phase !== 'watching') return;
  reportedVideoEnded = true;
  const wait = $('watch-wait');
  if (wait) wait.style.display = 'grid';
  socket.emit('wo-video-ended');
}

function destroyPlayer() {
  if (fallbackEndTimer) {
    clearTimeout(fallbackEndTimer);
    fallbackEndTimer = null;
  }
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

function clearRevealPlayers() {
  revealMainId = null;
  revealImpId = null;
  const main = $('reveal-main');
  const imp = $('reveal-imp');
  if (main) main.innerHTML = '';
  if (imp) imp.innerHTML = '';
}

function revealThumbHtml(videoId) {
  const safe = String(videoId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const thumb = `https://i.ytimg.com/vi/${safe}/hqdefault.jpg`;
  return `<button type="button" class="wo-reveal-thumb" data-video-id="${safe}" aria-label="Lire la vidéo">
    <img src="${thumb}" alt="" loading="lazy">
    <span class="wo-reveal-play">▶</span>
  </button>`;
}

function stopOtherRevealEmbeds(exceptId) {
  ['reveal-main', 'reveal-imp'].forEach((cid) => {
    if (cid === exceptId) return;
    const el = $(cid);
    const iframe = el?.querySelector('iframe');
    if (!iframe) return;
    const vid = iframe.dataset.videoId;
    if (!vid) return;
    el.innerHTML = revealThumbHtml(vid);
    bindRevealThumb(cid);
  });
}

function bindRevealThumb(containerId) {
  const el = $(containerId);
  const btn = el?.querySelector('.wo-reveal-thumb');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    const videoId = btn.dataset.videoId;
    if (!videoId) return;
    stopOtherRevealEmbeds(containerId);
    el.innerHTML = `<iframe
      data-video-id="${videoId}"
      src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&modestbranding=1&playsinline=1"
      allow="autoplay; encrypted-media; picture-in-picture"
      allowfullscreen
      title="reveal"></iframe>`;
  });
}

function mountWatchPlayer(videoId) {
  if (!videoId) return;
  if (currentVideoId === videoId && (ytPlayer || $('yt-mount')?.querySelector('iframe'))) return;
  destroyPlayer();
  currentVideoId = videoId;
  reportedVideoEnded = false;
  $('watch-wait').style.display = 'none';
  $('yt-mount').innerHTML = '';

  const durSec = Math.max(8, Number(state?.myVideoDuration) || Number(state?.watchSec) || 30);
  // Filet de sécu si l’API YT ne signale pas ENDED (iframe / erreur / pub)
  fallbackEndTimer = setTimeout(reportVideoEnded, (durSec + 2) * 1000);

  if (!ytReady || typeof YT === 'undefined' || !YT.Player) {
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
        if (e.data === YT.PlayerState.ENDED) reportVideoEnded();
      },
      onError() {
        reportVideoEnded();
      }
    }
  });
}

function mountRevealPreview(containerId, videoId, slot) {
  const el = $(containerId);
  if (!el) return;
  if (!videoId) {
    el.innerHTML = '';
    if (slot === 'main') revealMainId = null;
    else if (slot === 'imp') revealImpId = null;
    return;
  }
  // Miniatures stables ; un seul embed à la fois (évite limite YouTube / clignotement)
  const already =
    (slot === 'main' && revealMainId === videoId) ||
    (slot === 'imp' && revealImpId === videoId);
  if (already && (el.querySelector('iframe') || el.querySelector('.wo-reveal-thumb'))) {
    bindRevealThumb(containerId);
    return;
  }

  if (slot === 'main') revealMainId = videoId;
  else if (slot === 'imp') revealImpId = videoId;

  el.innerHTML = revealThumbHtml(videoId);
  bindRevealThumb(containerId);
}

function renderCategories(available, selected) {
  const box = $('set-categories');
  if (!box) return;
  const sel = new Set(selected || available);
  const next = (available || [])
    .map((c) => {
      const label = CAT_LABELS[c] || c;
      return `<label><input type="checkbox" value="${c}" ${sel.has(c) ? 'checked' : ''}> ${label}</label>`;
    })
    .join('');
  // Évite de écraser les cases pendant que l’hôte clique
  if (box.dataset.signature === next) return;
  box.dataset.signature = next;
  box.innerHTML = next;
}

function collectSettings() {
  const cats = [...document.querySelectorAll('#set-categories input:checked')].map((i) => i.value);
  return {
    roundCount: parseInt($('set-rounds').value, 10),
    maxVideoSec: parseInt($('set-max-video').value, 10),
    discussionSec: parseInt($('set-discussion').value, 10),
    voteSec: parseInt($('set-vote').value, 10),
    difficulty: $('set-difficulty').value,
    showRoleAtStart: $('set-show-role')?.value !== '0',
    categories: cats
  };
}

function pushSettings() {
  if (!state?.isHost || state.phase !== 'lobby') return;
  socket.emit('wo-update-settings', collectSettings());
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
    clearRevealPlayers();
    showScreen('screen-lobby');
    $('lobby-code').textContent = s.code;
    $('lobby-player-count').textContent = `(${s.players.length}/${s.maxPlayers})`;
    $('lobby-players').innerHTML = s.players
      .map((p) => `<li>${escapeHtml(p.name)}${p.isHost ? ' · hôte' : ''} · ${p.score} pts</li>`)
      .join('');
    $('lobby-min-hint').textContent = `Minimum ${s.minPlayers} joueurs pour lancer.`;
    const ytBox = $('youtube-status');
    if (ytBox) {
      if (!s.youtubeConfigured) {
        ytBox.style.display = 'block';
        ytBox.innerHTML =
          '<p style="color:#f87171;margin:0;"><strong>YouTube API non configurée sur le serveur.</strong> Les mêmes vidéos de secours vont revenir. Ajoute <code>YOUTUBE_API_KEY</code> dans les variables d’environnement Render, puis redéploie.</p>';
      } else {
        ytBox.style.display = 'block';
        ytBox.innerHTML =
          '<p style="color:#34d399;margin:0;">YouTube API active — vidéos aléatoires par thème.</p>';
      }
    }
    $('host-settings').style.display = s.isHost ? 'block' : 'none';
    if (s.isHost) {
      const focusInSettings = Boolean(document.activeElement?.closest?.('#host-settings'));
      if (!focusInSettings) {
        $('set-rounds').value = String(s.settings.roundCount);
        $('set-max-video').value = String(s.settings.maxVideoSec);
        $('set-discussion').value = String(s.settings.discussionSec);
        $('set-vote').value = String(s.settings.voteSec);
        $('set-difficulty').value = s.settings.difficulty;
        if ($('set-show-role')) {
          $('set-show-role').value = s.settings.showRoleAtStart === false ? '0' : '1';
        }
        renderCategories(s.categoriesAvailable, s.settings.categories);
      } else if (!$('set-categories')?.children?.length) {
        renderCategories(s.categoriesAvailable, s.settings.categories);
      }
    }
    return;
  }

  if (s.phase === 'role_reveal') {
    destroyPlayer();
    clearRevealPlayers();
    showScreen('screen-role');
    $('role-round').textContent = `${s.currentRound}/${s.roundCount}`;
    const card = document.querySelector('.wo-role-card');
    const showRole = s.settings?.showRoleAtStart !== false && s.myRole;
    card.classList.toggle('impostor', showRole && s.myRole === 'impostor');
    card.classList.toggle('crew', showRole && s.myRole === 'crew');
    if (!showRole) {
      $('role-title').textContent = 'C’est parti';
      $('role-desc').textContent =
        'Regarde attentivement la vidéo. Ton rôle reste secret jusqu’à la révélation.';
    } else if (s.myRole === 'impostor') {
      $('role-title').textContent = 'Tu es l’IMPOSTEUR';
      $('role-desc').textContent =
        'Tu vas regarder une autre vidéo. Écoute les autres, bluffe, ne te fais pas griller.';
    } else {
      $('role-title').textContent = 'Tu fais partie de l’ÉQUIPE';
      $('role-desc').textContent =
        'Tout le monde (sauf un) voit la même vidéo. Trouvez l’Imposteur sans trop révéler.';
    }
    return;
  }

  if (s.phase === 'watching') {
    clearRevealPlayers();
    showScreen('screen-watch');
    const badge = $('watch-role-badge');
    if (s.settings?.showRoleAtStart === false || !s.myRole) {
      badge.style.display = 'none';
      badge.textContent = '';
    } else {
      badge.style.display = '';
      badge.textContent = s.myRole === 'impostor' ? 'Imposteur' : 'Équipe';
      badge.className = `wo-badge ${s.myRole === 'impostor' ? 'impostor' : 'crew'}`;
    }
    if (s.myVideoId) mountWatchPlayer(s.myVideoId);
    const skipW = $('btn-skip-watch');
    if (skipW) skipW.style.display = s.isHost ? 'inline-block' : 'none';
    return;
  }

  if (s.phase === 'discussion') {
    destroyPlayer();
    clearRevealPlayers();
    showScreen('screen-discussion');
    renderChat('chat-log', s.chat);
    $('btn-skip-disc').style.display = s.isHost ? 'inline-block' : 'none';
    return;
  }

  if (s.phase === 'voting' || s.phase === 'tie_break') {
    destroyPlayer();
    clearRevealPlayers();
    showScreen('screen-voting');
    $('vote-title').textContent =
      s.phase === 'tie_break'
        ? 'Égalité — 30 s de défense, puis nouveau vote'
        : 'Qui a vu la mauvaise vidéo ?';
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
      const themeEl = $('reveal-theme');
      if (themeEl) {
        const cat = CAT_LABELS[r.category] || r.category || s.pairCategory || '';
        const src = r.source || s.pairSource || '';
        const srcLabel = src === 'youtube-api' ? 'aléatoire YouTube' : src === 'bank' ? 'banque locale' : '';
        themeEl.textContent = [cat && `Thème : ${cat}`, srcLabel && `(${srcLabel})`]
          .filter(Boolean)
          .join(' ');
      }
      mountRevealPreview('reveal-main', r.mainVideoId, 'main');
      mountRevealPreview('reveal-imp', r.impostorVideoId, 'imp');
    }
    $('btn-next').style.display = s.isHost ? 'inline-block' : 'none';
    return;
  }

  if (s.phase === 'scoreboard' || s.phase === 'game_over') {
    destroyPlayer();
    clearRevealPlayers();
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
  const settings = collectSettings();
  if (!settings.categories.length) {
    alert('Sélectionne au moins une catégorie.');
    return;
  }
  socket.emit('wo-update-settings', settings);
  socket.emit('wo-start-game', settings);
});
['set-rounds', 'set-max-video', 'set-discussion', 'set-vote', 'set-difficulty', 'set-show-role'].forEach(
  (id) => {
    $(id)?.addEventListener('change', pushSettings);
  }
);
$('set-categories')?.addEventListener('change', pushSettings);

$('chat-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('chat-input').value;
  $('chat-input').value = '';
  socket.emit('wo-chat', { text });
});
$('btn-skip-disc')?.addEventListener('click', () => socket.emit('wo-skip-phase'));
$('btn-skip-watch')?.addEventListener('click', () => socket.emit('wo-skip-phase'));
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
