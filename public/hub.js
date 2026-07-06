const params = new URLSearchParams(location.search);

/** Redirection des anciens liens ?room=CODE vers Mot de la fin */
if (params.get('room')) {
  const room = params.get('room').toUpperCase();
  location.replace(`/games/mot-de-la-fin/?room=${encodeURIComponent(room)}`);
}

async function loadGames() {
  const grid = document.getElementById('games-grid');
  try {
    const res = await fetch('/api/games');
    if (!res.ok) throw new Error('API');
    const games = await res.json();
    renderGames(grid, games);
  } catch {
    grid.innerHTML = '<p class="games-error">Impossible de charger les jeux. Rechargez la page.</p>';
  }
}

function renderGames(container, games) {
  if (!games.length) {
    container.innerHTML = '<p class="games-error">Aucun jeu disponible pour le moment.</p>';
    return;
  }

  container.innerHTML = games.map(game => {
    const available = game.status === 'available' && game.path;
    const tag = available
      ? '<span class="game-card-tag available">Disponible</span>'
      : '<span class="game-card-tag soon">Bientôt</span>';

    const inner = `
      <div class="game-card-icon" style="--game-color:${game.color}">${game.icon}</div>
      <h2 class="game-card-title">${game.name}</h2>
      <p class="game-card-tagline">${game.tagline}</p>
      <div class="game-card-meta">
        <span>${game.players}</span>
        <span>${game.duration}</span>
      </div>
      ${tag}
    `;

    if (available) {
      return `<a href="${game.path}" class="game-card" style="--game-color:${game.color}">${inner}</a>`;
    }
    return `<div class="game-card game-card-disabled" style="--game-color:${game.color}">${inner}</div>`;
  }).join('');
}

loadGames();
