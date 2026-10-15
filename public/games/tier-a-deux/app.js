/* TIER À DEUX client */
const GAME_ID = 'tier-a-deux';
const GAME_PATH = '/games/tier-a-deux/';
const SESSION_KEY = 'tad-session';
const MUTE_KEY = 'tad-mute';
const socket = io({ transports: ['websocket', 'polling'] });

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

let state = null;
let order = [];
let itemsById = new Map();
let lockedLocal = false;
let rankMode = 'personal'; // personal | prediction
let muted = localStorage.getItem(MUTE_KEY) === '1';
let localPhaseEndsAt = null;
let syncedPhaseEndsAt = null;
let syncedPhase = null;
let configPushTimer = null;
let dragId = null;

const escapeHtml =
  typeof window !== 'undefined' && window.escapeHtml
    ? window.escapeHtml
    : (s) =>
        String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

const RANK_LABELS_5 = ['J’adore', 'J’aime bien', 'Bof', 'J’aime pas', 'Je déteste'];

function rankLabel(i, n) {
  if (n === 5) return RANK_LABELS_5[i] || `#${i + 1}`;
  if (i === 0) return 'Top';
  if (i === n - 1) return 'Flop';
  return `#${i + 1}`;
}

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

function beep(freq = 520, dur = 0.08) {
  if (muted) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    o.type = 'triangle';
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
    setTimeout(() => ctx.close(), 300);
  } catch {
    /* ignore */
  }
}

function confettiBurst() {
  const box = $('confetti');
  if (!box) return;
  box.innerHTML = '';
  const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4ecdc4', '#9775fa'];
  for (let i = 0; i < 28; i++) {
    const el = document.createElement('i');
    el.style.left = `${Math.random() * 100}%`;
    el.style.top = `${-10 - Math.random() * 20}%`;
    el.style.background = colors[i % colors.length];
    el.style.animationDelay = `${Math.random() * 0.25}s`;
    box.appendChild(el);
  }
  setTimeout(() => {
    box.innerHTML = '';
  }, 1600);
}

function saveSession(s) {
  if (!s?.code || !s?.reconnectToken) return;
  if (s.phase === 'lobby' || s.phase === 'game_results') return;
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ code: s.code, token: s.reconnectToken })
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
  socket.emit('tad-reclaim', { code: session.code, token: session.token });
}

function playerName() {
  return $('player-name')?.value.trim() || 'Joueur';
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
  const el = $('rank-timer');
  if (!el) return;
  const timed =
    state &&
    state.config?.timer?.enabled &&
    (state.phase === 'personal_ranking' || state.phase === 'partner_prediction') &&
    localPhaseEndsAt != null;
  if (!timed) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'inline';
  const left = Math.max(0, localPhaseEndsAt - Date.now());
  el.textContent = String(Math.ceil(left / 1000));
}

function renderPlayers(el, players) {
  if (!el) return;
  el.innerHTML = (players || [])
    .map((p) => {
      const bits = [
        escapeHtml(p.name),
        p.isHost ? 'hôte' : null,
        p.ready ? 'prêt ✓' : 'pas prêt',
        p.disconnected ? '⚠ déco' : null
      ].filter(Boolean);
      return `<li>${bits.join(' · ')}</li>`;
    })
    .join('');
}

function fillCategories(labels) {
  const box = $('cfg-categories');
  if (!box || box.dataset.ready) return;
  const cats = Object.keys(labels || {});
  box.innerHTML = cats
    .map(
      (id) =>
        `<label><input type="checkbox" data-cat="${id}" checked> ${escapeHtml(
          labels[id] || id
        )}</label>`
    )
    .join('');
  box.dataset.ready = '1';
}

function readConfigFromForm() {
  const timerVal = $('cfg-timer')?.value || 'off';
  const timerOn = timerVal !== 'off';
  const sec = timerOn ? parseInt(timerVal, 10) : 60;
  const cats = [...document.querySelectorAll('#cfg-categories input[data-cat]:checked')].map(
    (el) => el.dataset.cat
  );
  const rounds = $('cfg-rounds')?.value;
  return {
    roundCount: rounds === 'unlimited' ? 'unlimited' : parseInt(rounds || '5', 10),
    itemsPerRound: parseInt($('cfg-items')?.value || '5', 10),
    timer: {
      enabled: timerOn,
      personalRankingSeconds: sec,
      predictionSeconds: sec
    },
    categories: cats.length ? cats : undefined,
    generationMode: $('cfg-genmode')?.value || 'balanced',
    absurdity: $('cfg-absurdity')?.value || 'chaos',
    humorLevel: $('cfg-humor')?.value || 'quirky',
    allowCelebrities: $('cfg-celebs')?.checked !== false,
    allowAwkward: $('cfg-awkward')?.checked !== false,
    allowControversial: $('cfg-controversial')?.checked !== false,
    avoidRepeats: $('cfg-avoid-repeats')?.checked !== false,
    scoring: {
      correctPrediction: parseInt($('cfg-score-pred')?.value || '1', 10),
      matchingPosition: parseInt($('cfg-score-match')?.value || '2', 10),
      perfectPredictionBonus: parseInt($('cfg-score-perfect')?.value || '0', 10),
      identicalRankingBonus: parseInt($('cfg-score-identical')?.value || '0', 10)
    },
    reveal: {
      mode: $('cfg-reveal-mode')?.value || 'manual',
      intervalSeconds: parseInt($('cfg-reveal-interval')?.value || '6', 10),
      order: $('cfg-reveal-order')?.value || 'random'
    },
    showScores: $('cfg-show-scores')?.value || 'each_round',
    autoSubmitOnTimeout: $('cfg-auto-submit')?.checked !== false
  };
}

function applyConfigToForm(cfg) {
  if (!cfg || !state?.isHost) return;
  if (document.activeElement?.closest?.('#host-config')) return;

  const rounds = cfg.roundCount === 'unlimited' ? 'unlimited' : String(cfg.roundCount);
  if ($('cfg-rounds')) $('cfg-rounds').value = rounds;
  if ($('cfg-items')) $('cfg-items').value = String(cfg.itemsPerRound);
  if ($('cfg-timer')) {
    $('cfg-timer').value = cfg.timer?.enabled
      ? String(cfg.timer.personalRankingSeconds)
      : 'off';
  }
  if ($('cfg-absurdity')) $('cfg-absurdity').value = cfg.absurdity;
  if ($('cfg-humor')) $('cfg-humor').value = cfg.humorLevel;
  if ($('cfg-genmode')) $('cfg-genmode').value = cfg.generationMode;
  if ($('cfg-celebs')) $('cfg-celebs').checked = cfg.allowCelebrities !== false;
  if ($('cfg-awkward')) $('cfg-awkward').checked = cfg.allowAwkward !== false;
  if ($('cfg-controversial')) {
    $('cfg-controversial').checked = cfg.allowControversial !== false;
  }
  if ($('cfg-avoid-repeats')) $('cfg-avoid-repeats').checked = cfg.avoidRepeats !== false;
  if ($('cfg-score-pred')) $('cfg-score-pred').value = cfg.scoring?.correctPrediction ?? 1;
  if ($('cfg-score-match')) $('cfg-score-match').value = cfg.scoring?.matchingPosition ?? 2;
  if ($('cfg-score-perfect')) {
    $('cfg-score-perfect').value = cfg.scoring?.perfectPredictionBonus ?? 0;
  }
  if ($('cfg-score-identical')) {
    $('cfg-score-identical').value = cfg.scoring?.identicalRankingBonus ?? 0;
  }
  if ($('cfg-reveal-mode')) $('cfg-reveal-mode').value = cfg.reveal?.mode || 'manual';
  if ($('cfg-reveal-interval')) {
    $('cfg-reveal-interval').value = cfg.reveal?.intervalSeconds ?? 6;
  }
  if ($('cfg-reveal-order')) $('cfg-reveal-order').value = cfg.reveal?.order || 'random';
  if ($('cfg-show-scores')) $('cfg-show-scores').value = cfg.showScores || 'each_round';
  if ($('cfg-auto-submit')) $('cfg-auto-submit').checked = cfg.autoSubmitOnTimeout !== false;

  const set = new Set(cfg.categories || []);
  document.querySelectorAll('#cfg-categories input[data-cat]').forEach((el) => {
    el.checked = set.size ? set.has(el.dataset.cat) : true;
  });
}

function pushConfigSoon() {
  if (!state?.isHost || state.phase !== 'lobby') return;
  clearTimeout(configPushTimer);
  configPushTimer = setTimeout(() => {
    socket.emit('tad-update-config', readConfigFromForm());
  }, 180);
}

function renderRecap(lines) {
  const el = $('config-recap');
  if (!el) return;
  el.innerHTML = (lines || []).map((l) => `<li>${escapeHtml(l)}</li>`).join('');
}

function moveItem(id, dir) {
  if (lockedLocal) return;
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  beep(400, 0.05);
  renderRankList();
  syncDraft();
}

function syncDraft() {
  if (lockedLocal || !state) return;
  const kind = rankMode === 'prediction' ? 'prediction' : 'personal';
  socket.emit('tad-sync-draft', { kind, ranking: order });
}

function renderRankList() {
  const list = $('rank-list');
  if (!list) return;
  const n = order.length;
  list.classList.toggle('tad-locked', lockedLocal);
  list.innerHTML = order
    .map((id, i) => {
      const item = itemsById.get(id);
      const text = item?.text || id;
      return `<li class="tad-rank-slot" data-rank="${i + 1}" data-id="${escapeHtml(id)}">
        <div class="tad-rank-badge">${escapeHtml(rankLabel(i, n))}</div>
        <div class="tad-item-card" draggable="${lockedLocal ? 'false' : 'true'}" data-id="${escapeHtml(id)}">${escapeHtml(text)}</div>
        <div class="tad-move-btns">
          <button type="button" data-up="${escapeHtml(id)}" ${lockedLocal || i === 0 ? 'disabled' : ''} aria-label="Monter">↑</button>
          <button type="button" data-down="${escapeHtml(id)}" ${lockedLocal || i === n - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button>
        </div>
      </li>`;
    })
    .join('');

  list.querySelectorAll('[data-up]').forEach((btn) => {
    btn.addEventListener('click', () => moveItem(btn.getAttribute('data-up'), -1));
  });
  list.querySelectorAll('[data-down]').forEach((btn) => {
    btn.addEventListener('click', () => moveItem(btn.getAttribute('data-down'), 1));
  });

  list.querySelectorAll('.tad-item-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      if (lockedLocal) return;
      dragId = card.dataset.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      dragId = null;
      list.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const targetId = card.dataset.id;
      if (!dragId || dragId === targetId || lockedLocal) return;
      const from = order.indexOf(dragId);
      const to = order.indexOf(targetId);
      if (from < 0 || to < 0) return;
      order.splice(from, 1);
      order.splice(to, 0, dragId);
      beep(440, 0.05);
      renderRankList();
      syncDraft();
    });

    // Touch simple: tap + swipe via buttons primarily; long-press reorder via touch move
    let touchY = null;
    card.addEventListener(
      'touchstart',
      (e) => {
        if (lockedLocal) return;
        touchY = e.touches[0].clientY;
        dragId = card.dataset.id;
      },
      { passive: true }
    );
    card.addEventListener(
      'touchmove',
      (e) => {
        if (lockedLocal || touchY == null || !dragId) return;
        const dy = e.touches[0].clientY - touchY;
        if (Math.abs(dy) > 36) {
          moveItem(dragId, dy > 0 ? 1 : -1);
          touchY = e.touches[0].clientY;
        }
      },
      { passive: true }
    );
    card.addEventListener('touchend', () => {
      touchY = null;
      dragId = null;
    });
  });
}

function setupRankScreen(s, mode) {
  rankMode = mode;
  itemsById = new Map((s.items || []).map((it) => [it.id, it]));
  const locked =
    mode === 'personal' ? Boolean(s.myPersonalLocked) : Boolean(s.myPredictionLocked);
  lockedLocal = locked;

  if (locked) {
    order =
      mode === 'personal'
        ? [...(s.myPersonal || [])]
        : [...(s.myPrediction || s.displayOrder || s.items.map((x) => x.id))];
  } else if (!order.length || order.length !== (s.items || []).length) {
    order = (s.items || []).map((x) => x.id);
  } else {
    // keep local order if still valid
    const ids = new Set((s.items || []).map((x) => x.id));
    if (order.some((id) => !ids.has(id)) || order.length !== ids.size) {
      order = (s.items || []).map((x) => x.id);
    }
  }

  const rounds =
    s.roundCount === 'unlimited' ? `${s.currentRound}/∞` : `${s.currentRound}/${s.roundCount}`;
  $('rank-round').textContent = `Manche ${rounds}`;
  $('rank-phase-label').textContent =
    mode === 'personal' ? 'Ton classement' : 'Sa prédiction';

  if (mode === 'personal') {
    $('rank-title').textContent = 'Classe ces éléments selon tes préférences personnelles.';
    $('btn-lock-rank').textContent = 'Valider mon classement';
  } else {
    $('rank-title').textContent = 'MAINTENANT, DEVINE SON CLASSEMENT !';
    $('btn-lock-rank').textContent = 'Je connais mon partenaire !';
  }

  const waiting = $('rank-waiting');
  const btn = $('btn-lock-rank');
  if (locked) {
    btn.style.display = 'none';
    waiting.style.display = 'block';
    waiting.textContent =
      mode === 'personal'
        ? 'Ton classement est enregistré ! Ton partenaire réfléchit encore…'
        : 'Prédiction enregistrée — en attente de ton partenaire…';
  } else {
    btn.style.display = 'block';
    btn.disabled = false;
    waiting.style.display = 'none';
  }

  renderRankList();
  showScreen('screen-rank');
}

function renderReveal(s) {
  showScreen('screen-reveal');
  const rounds =
    s.roundCount === 'unlimited' ? `${s.currentRound}/∞` : `${s.currentRound}/${s.roundCount}`;
  $('rev-round').textContent = `Manche ${rounds}`;
  const rev = s.reveal;
  if (!rev) return;
  $('rev-progress').textContent = `${Math.min(rev.index + 1, rev.total)}/${rev.total}`;

  const suspense = $('rev-suspense');
  const detail = $('rev-detail');
  const btn = $('btn-reveal-continue');
  const wait = $('rev-waiting');
  const box = $('reveal-box');

  if (rev.index === 0 && !rev.iAcked && !rev.item) {
    // shouldn't happen
  }

  const showItem = rev.item;
  if (!rev.iAcked && rev.index === 0 && showItem) {
    // first item still show suspense briefly on first paint — skip, show item
  }

  if (!showItem) {
    suspense.style.display = 'block';
    detail.style.display = 'none';
  } else {
    suspense.style.display = rev.index === 0 && !rev.iAcked ? 'none' : 'none';
    detail.style.display = 'block';
    $('rev-item-text').textContent = showItem.text;
    const nameA = s.players?.[0]?.name || 'Joueur A';
    const nameB = s.players?.[1]?.name || 'Joueur B';
    const aId = s.players?.[0]?.id;
    const ptsA = showItem.pointsA;
    const ptsB = showItem.pointsB;
    $('rev-grid').innerHTML = `
      <div><strong>${escapeHtml(nameA)}</strong> l’a placé : #${showItem.positionA}</div>
      <div><strong>${escapeHtml(nameB)}</strong> l’a placé : #${showItem.positionB}</div>
      <div>${escapeHtml(nameA)} avait prédit : #${showItem.predictionA}</div>
      <div>${escapeHtml(nameB)} avait prédit : #${showItem.predictionB}</div>
      <div>${escapeHtml(nameA)} : +${ptsA?.total || 0} pts · ${escapeHtml(nameB)} : +${ptsB?.total || 0} pts</div>
    `;
    $('rev-reaction').textContent = showItem.reaction || '';
    box.classList.toggle('tad-match-flash', Boolean(showItem.matchedPersonal));
    if (showItem.matchedPersonal) {
      beep(660, 0.1);
      confettiBurst();
    }
  }

  if (rev.iAcked) {
    btn.style.display = 'none';
    wait.style.display = 'block';
  } else {
    btn.style.display = 'inline-block';
    wait.style.display = 'none';
  }
}

function renderRoundResults(s) {
  showScreen('screen-round');
  const rr = s.roundResults;
  if (!rr) {
    $('round-compat').textContent = 'Scores masqués jusqu’à la fin';
    $('round-reaction').textContent = '';
    $('round-scores').innerHTML = '';
    $('round-rankings').innerHTML = '';
  } else {
    $('round-compat').textContent = `Compatibilité : ${rr.compatibilityPercent} %`;
    $('round-reaction').textContent = rr.reaction || '';
    const col = (sc) => `
      <div class="card tad-card tad-score-col">
        <h3>${escapeHtml(sc.name)}</h3>
        <p>Prédiction : <strong>${sc.predictionPoints}</strong></p>
        <p>Compatibilité : <strong>${sc.matchPoints}</strong></p>
        ${sc.perfectBonus ? `<p>Bonus parfait : <strong>${sc.perfectBonus}</strong></p>` : ''}
        ${sc.identicalBonus ? `<p>Bonus identiques : <strong>${sc.identicalBonus}</strong></p>` : ''}
        <p>Total manche : <strong>${sc.total}</strong></p>
        <p>Cumul : <strong>${sc.cumulative}</strong></p>
      </div>`;
    $('round-scores').innerHTML = col(rr.scoreA) + col(rr.scoreB);
    const rankCol = (r) => `
      <div class="card tad-card">
        <h3>${escapeHtml(r.name)}</h3>
        <ol>${(r.order || [])
          .map((it, i) => `<li>#${i + 1} ${escapeHtml(it.text)}</li>`)
          .join('')}</ol>
      </div>`;
    $('round-rankings').innerHTML = rankCol(rr.rankingA) + rankCol(rr.rankingB);
  }

  const waiting = $('next-waiting');
  const meReady = rr?.nextReady?.find((p) => p.id === s.myId)?.ready;
  if (meReady) {
    $('btn-next-round').style.display = 'none';
    waiting.style.display = 'block';
    waiting.textContent = 'En attente de ton partenaire…';
  } else {
    $('btn-next-round').style.display = 'inline-block';
    waiting.style.display = 'none';
  }

  const endBtn = $('btn-end-unlimited');
  if (endBtn) {
    endBtn.style.display = s.isHost && s.roundCount === 'unlimited' ? 'inline-block' : 'none';
  }
}

function renderEnd(s) {
  clearSession();
  showScreen('screen-end');
  const g = s.gameStats;
  if (!g) return;
  const winner = g.scores?.find((x) => x.id === g.winnerId);
  $('end-winner').textContent = winner
    ? `${winner.name} gagne !`
    : 'Égalité parfaite !';
  $('end-titles').innerHTML = (g.titles || [])
    .map((t) => {
      const who = t.playerId
        ? g.scores.find((x) => x.id === t.playerId)?.name || ''
        : 'Duo';
      return `<span class="tad-title-pill">${escapeHtml(t.title)}${
        who ? ` · ${escapeHtml(who)}` : ''
      }</span>`;
    })
    .join('');
  $('end-stats').innerHTML = (g.scores || [])
    .map((p) => {
      const pred = g.correctPredictions?.[p.id] || 0;
      return `<li><strong>${escapeHtml(p.name)}</strong> — ${p.score} pts · ${pred} bonnes prédictions</li>`;
    })
    .join('');
  $('end-compat').textContent = `Compatibilité globale : ${g.globalCompatibilityPercent} % · ${g.matchingPositionsTotal} positions identiques · ${g.roundsPlayed} manches`;
  confettiBurst();
  beep(720, 0.12);
}

function render(s) {
  state = s;
  const nav = $('room-nav');
  if (nav) nav.style.display = s.phase === 'lobby' ? 'none' : 'flex';

  fillCategories(s.categoryLabels);
  renderRecap(s.configSummary);

  if (s.phase === 'lobby') {
    clearSession();
    order = [];
    lockedLocal = false;
    showScreen('screen-lobby');
    $('lobby-code').textContent = s.code || '------';
    $('lobby-player-count').textContent = `(${s.players?.length || 0}/2)`;
    renderPlayers($('lobby-players'), s.players);
    const me = s.players?.find((p) => p.id === s.myId);
    $('lobby-hint').textContent =
      s.players?.length < 2
        ? 'En attente du deuxième joueur…'
        : bothReady(s)
          ? 'Tout le monde est prêt !'
          : 'Cliquez sur « Je suis prêt » pour lancer.';
    $('btn-ready').textContent = me?.ready ? 'Pas prêt' : 'Je suis prêt';
    $('btn-start').style.display = s.isHost ? 'inline-block' : 'none';
    $('host-config').style.display = s.isHost ? 'block' : 'none';
    if (s.isHost) applyConfigToForm(s.config);
    return;
  }

  saveSession(s);

  if (s.phase === 'personal_ranking') {
    setupRankScreen(s, 'personal');
    return;
  }
  if (s.phase === 'partner_prediction') {
    // reset order when entering prediction fresh
    if (rankMode !== 'prediction') order = [];
    setupRankScreen(s, 'prediction');
    return;
  }
  if (s.phase === 'reveal') {
    renderReveal(s);
    return;
  }
  if (s.phase === 'round_results') {
    renderRoundResults(s);
    return;
  }
  if (s.phase === 'game_results') {
    renderEnd(s);
  }
}

function bothReady(s) {
  return s.players?.length === 2 && s.players.every((p) => p.ready);
}

socket.on('connect', () => {
  setStatus('Connecté', true);
  if (state && state.phase !== 'lobby' && state.phase !== 'game_results') tryReclaim();
  else if (!state && loadSession()) tryReclaim();
});
socket.on('disconnect', () => {
  setStatus('Déconnecté — reconnexion…', false);
  if (state && state.phase !== 'lobby') showToast('Connexion coupée — reprise auto…');
});
socket.on('error-msg', (msg) => {
  showToast(msg);
  if (String(msg || '').includes('introuvable')) clearSession();
});
socket.on('left-room', () => {
  state = null;
  clearSession();
  showScreen('screen-home');
  if ($('room-nav')) $('room-nav').style.display = 'none';
});
socket.on('room-state', (s) => {
  if (s.gameId && s.gameId !== GAME_ID) return;
  try {
    render(s);
    syncTimers(s);
    tickTimers();
  } catch (err) {
    console.error('TAD render', err);
    showToast('Erreur d’affichage');
  }
});

$('btn-mute')?.addEventListener('click', () => {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
});
if ($('btn-mute')) $('btn-mute').textContent = muted ? '🔇' : '🔊';

$('btn-create')?.addEventListener('click', () => {
  clearSession();
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
$('btn-ready')?.addEventListener('click', () => {
  const me = state?.players?.find((p) => p.id === state.myId);
  socket.emit('tad-set-ready', { ready: !me?.ready });
});
$('btn-start')?.addEventListener('click', () => {
  if (state?.isHost) socket.emit('tad-update-config', readConfigFromForm());
  socket.emit('tad-start-game');
});

document.querySelectorAll('[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    socket.emit('tad-apply-preset', { preset: btn.dataset.preset });
  });
});
$('btn-reset-config')?.addEventListener('click', () => {
  socket.emit('tad-reset-config');
});

$('config-tabs')?.addEventListener('click', (e) => {
  const tab = e.target.closest('.tad-tab');
  if (!tab) return;
  document.querySelectorAll('.tad-tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.tad-tab-panel').forEach((p) => p.classList.remove('active'));
  tab.classList.add('active');
  document
    .querySelector(`.tad-tab-panel[data-panel="${tab.dataset.tab}"]`)
    ?.classList.add('active');
});

$('host-config')?.addEventListener('change', pushConfigSoon);
$('host-config')?.addEventListener('input', pushConfigSoon);

$('btn-lock-rank')?.addEventListener('click', () => {
  if (!socket.connected) {
    showToast('Pas de connexion');
    return;
  }
  if (lockedLocal) return;
  const evt =
    rankMode === 'prediction' ? 'tad-submit-prediction' : 'tad-submit-personal';
  socket.emit(evt, { ranking: order });
  beep(500, 0.08);
});

$('btn-reveal-continue')?.addEventListener('click', () => {
  socket.emit('tad-reveal-continue');
  beep(480, 0.06);
});
$('btn-next-round')?.addEventListener('click', () => {
  socket.emit('tad-next-round');
});
$('btn-end-unlimited')?.addEventListener('click', () => {
  if (state?.isHost) socket.emit('tad-end-game');
});
$('btn-rematch')?.addEventListener('click', () => {
  if (state?.isHost) socket.emit('tad-rematch');
});
$('btn-end-lobby')?.addEventListener('click', () => {
  if (state?.isHost) socket.emit('tad-back-to-lobby');
});
$('btn-salon')?.addEventListener('click', () => {
  if (!state?.isHost) return;
  clearSession();
  socket.emit('tad-back-to-lobby');
});
$('btn-menu')?.addEventListener('click', () => {
  clearSession();
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
  if ($('join-panel')) $('join-panel').style.display = 'block';
  if ($('join-code')) $('join-code').value = params.get('room').toUpperCase();
}

setInterval(tickTimers, 200);
