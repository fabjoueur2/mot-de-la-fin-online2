/* TIER À DEUX — 1 listeur + N devineurs, pool → slots */
const GAME_ID = 'tier-a-deux';
const GAME_PATH = '/games/tier-a-deux/';
const SESSION_KEY = 'tad-session';
const MUTE_KEY = 'tad-mute';
const socket = io({ transports: ['websocket', 'polling'] });

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

let state = null;
/** @type {(string|null)[]} slots[i] = itemId at rank i+1 */
let slots = [];
/** @type {string[]} */
let pool = [];
let itemsById = new Map();
let lockedLocal = false;
let rankMode = 'listing'; // listing | guessing
let muted = localStorage.getItem(MUTE_KEY) === '1';
let localPhaseEndsAt = null;
let syncedPhaseEndsAt = null;
let syncedPhase = null;
let configPushTimer = null;
let dragId = null;
let uiRoundKey = null;

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
  $(id)?.classList.add('active');
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
    localPhaseEndsAt =
      typeof s.phaseRemainingMs === 'number'
        ? Date.now() + s.phaseRemainingMs
        : s.phaseEndsAt || null;
    syncedPhaseEndsAt = s.phaseEndsAt;
  }
  syncedPhase = s.phase;
}

function tickTimers() {
  const el = $('rank-timer');
  if (!el) return;
  const timed =
    state?.config?.timer?.enabled &&
    (state.phase === 'listing' || state.phase === 'guessing') &&
    localPhaseEndsAt != null;
  if (!timed) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'inline';
  el.textContent = String(Math.ceil(Math.max(0, localPhaseEndsAt - Date.now()) / 1000));
}

function currentRanking() {
  return slots.every(Boolean) ? [...slots] : null;
}

function syncDraft() {
  if (lockedLocal || !state) return;
  const ranking = currentRanking();
  if (!ranking) return;
  const kind = rankMode === 'guessing' ? 'guess' : 'listing';
  socket.emit('tad-sync-draft', { kind, ranking });
}

function updateLockButton() {
  const btn = $('btn-lock-rank');
  if (!btn) return;
  const full = slots.length > 0 && slots.every(Boolean);
  btn.disabled = lockedLocal || !full;
}

function findItem(id) {
  return itemsById.get(id);
}

function removeFromSlots(id) {
  const i = slots.indexOf(id);
  if (i >= 0) slots[i] = null;
}

function removeFromPool(id) {
  pool = pool.filter((x) => x !== id);
}

function placeInSlot(id, slotIndex) {
  if (lockedLocal) return;
  const existing = slots[slotIndex];
  removeFromSlots(id);
  removeFromPool(id);
  if (existing && existing !== id) {
    pool.push(existing);
  }
  slots[slotIndex] = id;
  beep(420, 0.05);
  renderTierBoard();
  syncDraft();
}

function returnToPool(id) {
  if (lockedLocal) return;
  removeFromSlots(id);
  if (!pool.includes(id)) pool.push(id);
  beep(360, 0.05);
  renderTierBoard();
  syncDraft();
}

function bindCardDrag(card) {
  const id = card.dataset.id;
  card.addEventListener('dragstart', (e) => {
    if (lockedLocal) return;
    dragId = id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    dragId = null;
    document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
  });

  let touchY = null;
  let touchSlot = null;
  card.addEventListener(
    'touchstart',
    (e) => {
      if (lockedLocal) return;
      dragId = id;
      touchY = e.touches[0].clientY;
      touchSlot = null;
    },
    { passive: true }
  );
  card.addEventListener(
    'touchmove',
    (e) => {
      if (lockedLocal || !dragId) return;
      const t = e.touches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const zone = el?.closest?.('[data-slot], #tier-pool');
      document.querySelectorAll('.drag-over').forEach((x) => x.classList.remove('drag-over'));
      zone?.classList.add('drag-over');
      touchSlot = zone;
      touchY = t.clientY;
    },
    { passive: true }
  );
  card.addEventListener('touchend', () => {
    if (lockedLocal || !dragId) return;
    if (touchSlot?.id === 'tier-pool') returnToPool(dragId);
    else if (touchSlot?.dataset?.slot != null) {
      placeInSlot(dragId, parseInt(touchSlot.dataset.slot, 10));
    }
    document.querySelectorAll('.drag-over').forEach((x) => x.classList.remove('drag-over'));
    dragId = null;
    touchY = null;
    touchSlot = null;
  });
}

function makeCard(id, { inSlot } = {}) {
  const item = findItem(id);
  const card = document.createElement('div');
  card.className = 'tad-item-card';
  card.draggable = !lockedLocal;
  card.dataset.id = id;
  card.innerHTML = `<span>${escapeHtml(item?.text || id)}</span>`;
  if (inSlot && !lockedLocal) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tad-unslot';
    btn.setAttribute('aria-label', 'Retirer');
    btn.textContent = '×';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      returnToPool(id);
    });
    card.appendChild(btn);
  }
  if (!lockedLocal) bindCardDrag(card);
  return card;
}

function bindDropZone(el, onDrop) {
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag-over');
    const id = e.dataTransfer.getData('text/plain') || dragId;
    if (id) onDrop(id);
  });
}

function renderTierBoard() {
  const slotsEl = $('tier-slots');
  const poolEl = $('tier-pool');
  if (!slotsEl || !poolEl) return;
  const n = slots.length;
  slotsEl.classList.toggle('tad-locked', lockedLocal);
  poolEl.classList.toggle('tad-locked', lockedLocal);

  slotsEl.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const row = document.createElement('div');
    row.className = 'tad-tier-row';
    row.dataset.rank = String(i + 1);
    const badge = document.createElement('div');
    badge.className = 'tad-rank-badge';
    badge.textContent = rankLabel(i, n);
    const zone = document.createElement('div');
    zone.className = `tad-drop-zone${slots[i] ? '' : ' empty'}`;
    zone.dataset.slot = String(i);
    if (slots[i]) zone.appendChild(makeCard(slots[i], { inSlot: true }));
    if (!lockedLocal) bindDropZone(zone, (id) => placeInSlot(id, i));
    row.appendChild(badge);
    row.appendChild(zone);
    slotsEl.appendChild(row);
  }

  poolEl.innerHTML = '';
  if (!lockedLocal) bindDropZone(poolEl, (id) => returnToPool(id));
  for (const id of pool) {
    poolEl.appendChild(makeCard(id, { inSlot: false }));
  }
  updateLockButton();
}

function initBoardFromItems(items, lockedRanking) {
  itemsById = new Map((items || []).map((it) => [it.id, it]));
  const n = items?.length || 0;
  if (lockedRanking?.length === n) {
    slots = [...lockedRanking];
    pool = [];
  } else {
    slots = Array(n).fill(null);
    pool = (items || []).map((x) => x.id);
  }
}

function setupRankScreen(s) {
  const isListing = s.phase === 'listing';
  rankMode = isListing ? 'listing' : 'guessing';
  const isListeur = s.myId === s.listeurId;
  const everyone = s.playMode === 'everyone_lists';
  const rounds =
    s.roundCount === 'unlimited' ? `${s.currentRound}/∞` : `${s.currentRound}/${s.roundCount}`;
  $('rank-round').textContent = `Manche ${rounds}`;
  $('rank-phase-label').textContent = isListing
    ? everyone
      ? 'Chacun liste'
      : 'Listeur'
    : 'Devineurs';

  const key = `${s.phase}-${s.currentRound}-${s.listeurId}-${s.playMode}`;
  const needReset = uiRoundKey !== key;
  uiRoundKey = key;

  const active = $('rank-active');
  const waitCard = $('rank-waiting-card');
  const wait = $('rank-waiting');

  // Waiting views
  if (isListing && !everyone && !isListeur) {
    active.style.display = 'none';
    waitCard.style.display = 'block';
    wait.textContent = `${s.listeurName || 'Le listeur'} compose sa tier-list…`;
    showScreen('screen-rank');
    return;
  }
  if (!isListing && isListeur) {
    active.style.display = 'none';
    waitCard.style.display = 'block';
    wait.textContent = `Les autres devinent ta liste… (${s.guessesLockedCount || 0}/${
      s.guesserCount || 0
    })`;
    showScreen('screen-rank');
    return;
  }

  // Active ranking
  active.style.display = 'block';
  waitCard.style.display = 'none';

  lockedLocal = isListing ? Boolean(s.listingLocked) : Boolean(s.myGuessLocked);

  if (needReset || (!lockedLocal && slots.length !== (s.items || []).length)) {
    initBoardFromItems(s.items, lockedLocal ? (isListing ? s.myListing : s.myGuess) : null);
  } else if (lockedLocal) {
    initBoardFromItems(s.items, isListing ? s.myListing : s.myGuess);
  }

  if (isListing) {
    $('rank-title').textContent = everyone
      ? 'Compose ta tier-list personnelle'
      : 'Compose ta tier-list';
    $('rank-hint').textContent = everyone
      ? `Ensuite on devra deviner la liste de ${s.listeurName || 'la cible'} cette manche.`
      : 'Glisse chaque élément dans un rang (un seul par rang).';
    $('btn-lock-rank').textContent = 'Valider mon classement';
  } else {
    $('rank-title').textContent = `Devine la liste de ${s.listeurName || 'la cible'}`;
    $('rank-hint').textContent = 'Place les cartes comme tu penses qu’il/elle les a classées.';
    $('btn-lock-rank').textContent = 'Je connais mon partenaire !';
  }

  if (lockedLocal) {
    $('btn-lock-rank').style.display = 'none';
    waitCard.style.display = 'block';
    if (isListing && everyone) {
      wait.textContent = `Classement enregistré — en attente des autres… (${
        s.listingsDoneCount || 0
      }/${s.players?.length || 0})`;
    } else if (isListing) {
      wait.textContent = 'Classement enregistré — les devineurs s’y mettent…';
    } else {
      wait.textContent = 'Prédiction enregistrée — en attente des autres…';
    }
  } else {
    $('btn-lock-rank').style.display = 'block';
  }

  renderTierBoard();
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

  const detail = $('rev-detail');
  const suspense = $('rev-suspense');
  const btn = $('btn-reveal-continue');
  const wait = $('rev-waiting');
  const box = $('reveal-box');
  const item = rev.item;

  suspense.style.display = 'none';
  if (!item) {
    detail.style.display = 'none';
    return;
  }
  detail.style.display = 'block';
  $('rev-item-text').textContent = item.text;
  const guessLines = (item.guesses || [])
    .map(
      (g) =>
        `<div><strong>${escapeHtml(g.name)}</strong> avait prédit : #${
          g.predictedPosition ?? '—'
        } ${g.correct ? '✓' : ''} · +${g.points} pts</div>`
    )
    .join('');
  $('rev-grid').innerHTML = `
    <div><strong>${escapeHtml(rev.listeurName || 'Listeur')}</strong> l’a placé : #${
      item.listeurPosition
    }</div>
    ${guessLines}
  `;
  $('rev-reaction').textContent = item.reaction || '';
  box.classList.toggle('tad-match-flash', item.hits > 0 && item.hits === (item.guesses || []).length);
  if (item.hits > 0) {
    beep(660, 0.08);
    if (item.hits === (item.guesses || []).length) confettiBurst();
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
    $('round-listeur').textContent = '';
    $('round-scores').innerHTML = '';
    return;
  }
  $('round-compat').textContent = `Précision du groupe : ${rr.accuracyPercent} %`;
  $('round-reaction').textContent = rr.reaction || '';
  $('round-listeur').textContent = `Listeur : ${rr.listeurName}`;

  $('round-scores').innerHTML = (rr.playerScores || [])
    .map((sc) => {
      const badge = sc.isListeur ? ' · listeur' : '';
      return `<div class="card tad-card tad-score-col">
        <h3>${escapeHtml(sc.name)}${badge}</h3>
        <p>Prédiction : <strong>${sc.predictionPoints || 0}</strong></p>
        ${
          sc.matchPoints
            ? `<p>Même rang : <strong>${sc.matchPoints}</strong></p>`
            : ''
        }
        ${sc.perfectBonus ? `<p>Bonus parfait : <strong>${sc.perfectBonus}</strong></p>` : ''}
        <p>Total manche : <strong>${sc.total || 0}</strong></p>
        <p>Cumul : <strong>${sc.cumulative || 0}</strong></p>
      </div>`;
    })
    .join('');

  $('round-ranking-title').textContent = `Liste de ${rr.listeurName}`;
  $('round-ranking-list').innerHTML = (rr.listeurRanking || [])
    .map((it, i) => `<li>#${i + 1} ${escapeHtml(it.text)}</li>`)
    .join('');

  const meReady = rr.nextReady?.find((p) => p.id === s.myId)?.ready;
  if (meReady) {
    $('btn-next-round').style.display = 'none';
    $('next-waiting').style.display = 'block';
    $('next-waiting').textContent = 'En attente des autres…';
  } else {
    $('btn-next-round').style.display = 'inline-block';
    $('next-waiting').style.display = 'none';
  }
  $('btn-end-unlimited').style.display =
    s.isHost && s.roundCount === 'unlimited' ? 'inline-block' : 'none';
}

function renderEnd(s) {
  clearSession();
  showScreen('screen-end');
  const g = s.gameStats;
  if (!g) return;
  const winner = g.scores?.find((x) => x.id === g.winnerId);
  $('end-winner').textContent = winner ? `${winner.name} gagne !` : 'Égalité !';
  $('end-titles').innerHTML = (g.titles || [])
    .map((t) => {
      const who = t.playerId
        ? g.scores.find((x) => x.id === t.playerId)?.name || ''
        : 'Groupe';
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
  $('end-compat').textContent = `Précision globale : ${g.globalAccuracyPercent} % · ${g.correctTotal}/${g.possibleTotal} · ${g.roundsPlayed} manches`;
  confettiBurst();
  beep(720, 0.12);
}

function renderPlayers(el, players) {
  if (!el) return;
  el.innerHTML = (players || [])
    .map((p) => {
      const bits = [
        escapeHtml(p.name),
        p.isHost ? 'hôte' : null,
        p.isListeur ? 'listeur' : null,
        p.ready ? 'prêt ✓' : null,
        p.disconnected ? '⚠' : null
      ].filter(Boolean);
      return `<li>${bits.join(' · ')}</li>`;
    })
    .join('');
}

function fillCategories(labels) {
  const box = $('cfg-categories');
  if (!box || box.dataset.ready) return;
  box.innerHTML = Object.keys(labels || {})
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
    playMode: $('cfg-play-mode')?.value || 'single_listeur',
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
    humorLevel: $('cfg-humor')?.value || 'dark_light',
    allowCelebrities: $('cfg-celebs')?.checked !== false,
    allowAwkward: $('cfg-awkward')?.checked !== false,
    allowControversial: $('cfg-controversial')?.checked !== false,
    avoidRepeats: $('cfg-avoid-repeats')?.checked !== false,
    scoring: {
      correctPrediction: parseInt($('cfg-score-pred')?.value || '1', 10),
      matchingPosition: parseInt($('cfg-score-match')?.value || '2', 10),
      perfectPredictionBonus: parseInt($('cfg-score-perfect')?.value || '0', 10)
    },
    reveal: {
      mode: $('cfg-reveal-mode')?.value || 'manual',
      intervalSeconds: parseInt($('cfg-reveal-interval')?.value || '6', 10),
      order: $('cfg-reveal-order')?.value || 'listeur'
    },
    showScores: $('cfg-show-scores')?.value || 'each_round',
    autoSubmitOnTimeout: $('cfg-auto-submit')?.checked !== false
  };
}

function syncModeButtons(mode) {
  const m = mode || 'single_listeur';
  if ($('cfg-play-mode')) $('cfg-play-mode').value = m;
  document.querySelectorAll('.tad-mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.playMode === m);
  });
}

function applyConfigToForm(cfg) {
  if (!cfg || !state?.isHost) return;
  if (document.activeElement?.closest?.('#host-config')) return;
  syncModeButtons(cfg.playMode || 'single_listeur');
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
  if ($('cfg-controversial')) $('cfg-controversial').checked = cfg.allowControversial !== false;
  if ($('cfg-avoid-repeats')) $('cfg-avoid-repeats').checked = cfg.avoidRepeats !== false;
  if ($('cfg-score-pred')) $('cfg-score-pred').value = cfg.scoring?.correctPrediction ?? 1;
  if ($('cfg-score-match')) $('cfg-score-match').value = cfg.scoring?.matchingPosition ?? 2;
  if ($('cfg-score-perfect')) {
    $('cfg-score-perfect').value = cfg.scoring?.perfectPredictionBonus ?? 0;
  }
  if ($('cfg-reveal-mode')) $('cfg-reveal-mode').value = cfg.reveal?.mode || 'manual';
  if ($('cfg-reveal-interval')) {
    $('cfg-reveal-interval').value = cfg.reveal?.intervalSeconds ?? 6;
  }
  if ($('cfg-reveal-order')) $('cfg-reveal-order').value = cfg.reveal?.order || 'listeur';
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

function render(s) {
  state = s;
  const nav = $('room-nav');
  if (nav) nav.style.display = s.phase === 'lobby' ? 'none' : 'flex';
  fillCategories(s.categoryLabels);
  renderRecap(s.configSummary);

  if (s.phase === 'lobby') {
    clearSession();
    uiRoundKey = null;
    showScreen('screen-lobby');
    $('lobby-code').textContent = s.code || '------';
    $('lobby-player-count').textContent = `(${s.players?.length || 0}/${s.maxPlayers || 8})`;
    renderPlayers($('lobby-players'), s.players);
    const me = s.players?.find((p) => p.id === s.myId);
    $('lobby-hint').textContent =
      s.players?.length < 2
        ? 'En attente d’au moins un autre joueur…'
        : s.players.every((p) => p.ready)
          ? 'Tout le monde est prêt !'
          : 'Chacun clique sur « Je suis prêt ».';
    $('btn-ready').textContent = me?.ready ? 'Pas prêt' : 'Je suis prêt';
    $('btn-start').style.display = s.isHost ? 'inline-block' : 'none';
    $('host-config').style.display = s.isHost ? 'block' : 'none';
    if (s.isHost) applyConfigToForm(s.config);
    return;
  }

  saveSession(s);

  if (s.phase === 'listing' || s.phase === 'guessing') {
    setupRankScreen(s);
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
$('btn-reset-config')?.addEventListener('click', () => socket.emit('tad-reset-config'));

document.querySelectorAll('.tad-mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!state?.isHost || state.phase !== 'lobby') return;
    syncModeButtons(btn.dataset.playMode);
    pushConfigSoon();
  });
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
  const ranking = currentRanking();
  if (!ranking) {
    showToast('Place tous les éléments avant de valider.');
    return;
  }
  const evt = rankMode === 'guessing' ? 'tad-submit-guess' : 'tad-submit-listing';
  socket.emit(evt, { ranking });
  beep(500, 0.08);
});

$('btn-reveal-continue')?.addEventListener('click', () => {
  socket.emit('tad-reveal-continue');
  beep(480, 0.06);
});
$('btn-next-round')?.addEventListener('click', () => socket.emit('tad-next-round'));
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
