/* Patate Chaude client */
const GAME_ID = 'hot-potato';
const GAME_PATH = '/games/hot-potato/';
const socket = io({ transports: ['websocket', 'polling'] });

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

let state = null;
let localPotatoEndsAt = null;
let syncedPotatoEndsAt = null;
let localPhaseEndsAt = null;
let syncedPhaseEndsAt = null;
let syncedPhase = null;

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

function fillThemeSelect(available, settings) {
  const sel = $('set-theme');
  if (!sel) return;
  const themes = available?.length ? available : [];
  const opts =
    `<option value="random">Aléatoire</option>` +
    themes.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  if (sel.dataset.signature !== opts) {
    sel.dataset.signature = opts;
    sel.innerHTML = opts;
  }
  if (settings?.themeMode === 'fixed' && settings.themes?.[0] && themes.includes(settings.themes[0])) {
    sel.value = settings.themes[0];
  } else {
    sel.value = 'random';
  }
}

function collectSettings() {
  const themeVal = $('set-theme')?.value || 'random';
  const fixed = themeVal !== 'random';
  return {
    roundCount: parseInt($('set-rounds').value, 10),
    potatoSec: parseInt($('set-potato').value, 10),
    explosionsPerRound: parseInt($('set-explosions').value, 10),
    accelerate: Boolean($('set-accelerate')?.checked),
    themeMode: fixed ? 'fixed' : 'random',
    themes: fixed ? [themeVal] : [...(state?.themesAvailable || [])]
  };
}

function pushSettings() {
  if (!state?.isHost || state.phase !== 'lobby') return;
  socket.emit('hpc-update-settings', collectSettings());
}

function syncTimers(s) {
  if (s.phase !== syncedPhase || s.potatoEndsAt !== syncedPotatoEndsAt) {
    if (typeof s.potatoRemainingMs === 'number') {
      localPotatoEndsAt = Date.now() + s.potatoRemainingMs;
    } else {
      localPotatoEndsAt = s.potatoEndsAt || null;
    }
    syncedPotatoEndsAt = s.potatoEndsAt;
  }
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
  if (!state) return;
  if (state.phase === 'hot' && localPotatoEndsAt != null) {
    const left = Math.max(0, localPotatoEndsAt - Date.now());
    const dur = state.potatoDurationMs || 6000;
    const pct = Math.max(0, Math.min(100, (left / dur) * 100));
    const ring = $('hot-ring');
    if (ring) ring.style.setProperty('--pct', `${pct}%`);
    if ($('hot-timer')) $('hot-timer').textContent = String(Math.ceil(left / 1000));
  }
  if (state.phase === 'round_intro' && localPhaseEndsAt != null && $('intro-timer')) {
    const left = Math.max(0, localPhaseEndsAt - Date.now());
    $('intro-timer').textContent = `${Math.ceil(left / 1000)}s`;
  }
}

function renderScores(el, players) {
  if (!el) return;
  const list = [...(players || [])].sort(
    (a, b) => (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name)
  );
  el.innerHTML = list
    .map((p) => {
      const potato = p.isHolder ? '<span class="hpc-badge-potato">PATATE</span>' : '';
      return `<li><span>${escapeHtml(p.name)}${potato}${p.isHost ? ' · hôte' : ''}</span><strong>${p.score || 0}</strong></li>`;
    })
    .join('');
}

function render(s) {
  state = s;
  $('room-nav').style.display =
    s.phase === 'lobby' || s.phase === 'game_over' ? 'flex' : 'none';

  if (s.phase === 'lobby') {
    showScreen('screen-lobby');
    $('lobby-code').textContent = s.code;
    $('lobby-player-count').textContent = `(${s.players.length}/${s.maxPlayers})`;
    $('lobby-players').innerHTML = s.players
      .map(
        (p) =>
          `<li>${escapeHtml(p.name)}${p.isHost ? ' · hôte' : ''} · ${p.score} pts</li>`
      )
      .join('');
    $('lobby-min-hint').textContent = `Minimum ${s.minPlayers} joueurs pour lancer.`;
    $('host-settings').style.display = s.isHost ? 'block' : 'none';
    if (s.isHost) {
      const focusInSettings = Boolean(document.activeElement?.closest?.('#host-settings'));
      if (!focusInSettings) {
        $('set-rounds').value = String(s.settings.roundCount);
        $('set-potato').value = String(s.settings.potatoSec);
        $('set-explosions').value = String(s.settings.explosionsPerRound);
        $('set-accelerate').checked = Boolean(s.settings.accelerate);
        fillThemeSelect(s.themesAvailable || [], s.settings);
      } else if (!$('set-theme')?.options?.length) {
        fillThemeSelect(s.themesAvailable || [], s.settings);
      }
      const hint = $('theme-check-hint');
      if (hint) {
        const tc = s.themeCheck || {};
        if (tc.aiConfigured) {
          hint.textContent = tc.lastAiError
            ? `IA thème : erreur (${tc.lastAiError}) — secours lexique.`
            : `IA thème active (${tc.model || 'ok'}).`;
        } else {
          hint.textContent =
            'IA thème inactive — lexique local. Vérifie OPENAI_API_KEY sur Render puis redéploie.';
        }
      }
    }
    return;
  }

  if (s.phase === 'round_intro') {
    showScreen('screen-intro');
    $('intro-theme').textContent = s.theme || 'Libre';
    $('intro-word').textContent = s.previousWord || '—';
    $('intro-letter').textContent = s.expectedLetter
      ? `Enchaîne avec « ${s.expectedLetter} »`
      : '';
    $('intro-holder').textContent = s.holderName
      ? `${s.holderName} commence !`
      : '';
    return;
  }

  if (s.phase === 'hot') {
    showScreen('screen-hot');
    $('hot-round').textContent = `Manche ${s.currentRound}/${s.roundCount}`;
    $('hot-booms').textContent = `💥 ${s.explosionsThisRound}/${s.explosionsPerRound}`;
    $('hot-theme').textContent = s.theme || 'Libre';
    $('hot-word').textContent = s.previousWord || '—';
    $('hot-letter').textContent = s.expectedLetter
      ? `→ ${s.expectedLetter}`
      : '';
    const holderEl = $('hot-holder');
    if (s.isHolder) {
      holderEl.textContent = '🔥 À toi — tape un mot !';
      holderEl.className = 'hpc-holder me hot';
    } else {
      holderEl.textContent = `Patate chez ${s.holderName || '…'}`;
      holderEl.className = 'hpc-holder hot';
    }
    const input = $('word-input');
    const btn = $('btn-submit');
    if (pendingWord && s.lastEvent?.type === 'success') pendingWord = '';
    input.disabled = !s.isHolder;
    btn.disabled = !s.isHolder;
    $('hot-hint').textContent = s.isHolder
      ? `Mot qui commence par ${s.expectedLetter || '?'}`
      : 'Attends ton tour…';
    if (s.isHolder) {
      setTimeout(() => input.focus(), 50);
    }
    $('hot-chain').innerHTML = (s.chain || [])
      .map(
        (c) =>
          `<li><strong>${escapeHtml(c.word)}</strong> · ${escapeHtml(c.name)}</li>`
      )
      .join('') || '<li class="muted">Aucun mot encore</li>';
    renderScores($('hot-scores'), s.players);
    return;
  }

  if (s.phase === 'explode') {
    showScreen('screen-explode');
    const ev = s.lastEvent;
    $('explode-text').textContent = ev
      ? `${ev.playerName} a explosé (−2 pts)`
      : 'Explosion !';
    $('explode-next').textContent = s.previousWord
      ? `Nouveau mot : ${s.previousWord} → ${s.holderName || ''}`
      : '';
    return;
  }

  if (s.phase === 'scoreboard' || s.phase === 'game_over') {
    showScreen('screen-score');
    $('score-title').textContent =
      s.phase === 'game_over' ? 'Partie terminée' : `Fin de manche ${s.currentRound}`;
    const rank = s.ranking || s.players;
    $('score-list').innerHTML = rank
      .map(
        (p, i) =>
          `<li><span>#${i + 1} ${escapeHtml(p.name)} <span class="muted">(${p.wordsOk || 0} mots · ${p.explosions || 0} 💥)</span></span><strong>${p.score}</strong></li>`
      )
      .join('');
    const actions = $('score-actions');
    if (s.phase === 'game_over' && s.isHost) {
      actions.innerHTML = `
        <button class="btn btn-primary" id="btn-rematch">Rejouer</button>
        <button class="btn btn-secondary" id="btn-lobby">Retour salon</button>`;
      $('btn-rematch')?.addEventListener('click', () => socket.emit('hpc-rematch'));
      $('btn-lobby')?.addEventListener('click', () => socket.emit('hpc-back-to-lobby'));
    } else {
      actions.innerHTML =
        s.phase === 'scoreboard'
          ? '<p class="muted">Manche suivante…</p>'
          : '';
    }
  }
}

socket.on('connect', () => setStatus('Connecté', true));
socket.on('disconnect', () => setStatus('Déconnecté…', false));
let pendingWord = '';
socket.on('error-msg', (msg) => {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg || 'Erreur';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
  const input = $('word-input');
  if (input && pendingWord) {
    input.value = pendingWord;
    input.disabled = false;
    pendingWord = '';
    input.focus();
  }
});
socket.on('left-room', () => {
  state = null;
  showScreen('screen-home');
});
socket.on('room-state', (s) => {
  if (s.gameId && s.gameId !== GAME_ID) return;
  render(s);
  syncTimers(s);
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
  socket.emit('hpc-update-settings', settings);
  socket.emit('hpc-start-game', settings);
});
['set-rounds', 'set-potato', 'set-explosions', 'set-accelerate', 'set-theme'].forEach(
  (id) => {
    $(id)?.addEventListener('change', pushSettings);
  }
);

$('word-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!state?.isHolder) return;
  const input = $('word-input');
  const word = input?.value || '';
  if (!word.trim()) return;
  pendingWord = word;
  if (input) {
    input.value = '';
    input.disabled = true;
  }
  socket.emit('hpc-submit-word', { word });
});

$('btn-salon')?.addEventListener('click', () => {
  if (!state?.isHost) return;
  socket.emit('hpc-back-to-lobby');
});
$('btn-menu')?.addEventListener('click', () => {
  socket.emit('leave-room');
  location.href = '/';
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

setInterval(tickTimers, 100);
