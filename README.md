# Mot de la fin — Version en ligne

Jeu multijoueur en temps réel, style [StopotS](https://stopots.com) : créez une salle, partagez le code, jouez à distance.

## Jouer en local (test)

```bash
cd mot-de-la-fin-online
npm install
npm start
```

Ouvrez **http://localhost:3000** dans deux onglets pour simuler deux joueurs.

---

## Mettre en ligne GRATUITEMENT

Le jeu a besoin d’un **petit serveur Node.js** (pour le temps réel). Le frontend est inclus dedans. Voici les meilleures options gratuites :

### Option 1 — Render.com (recommandé, le plus simple)

1. **Créez un compte** sur [render.com](https://render.com) (gratuit, connexion GitHub).

2. **Poussez le projet sur GitHub** :
   ```bash
   cd mot-de-la-fin-online
   git init
   git add .
   git commit -m "Mot de la fin online"
   git branch -M main
   git remote add origin https://github.com/VOTRE_USER/mot-de-la-fin-online.git
   git push -u origin main
   ```

3. Sur Render : **New → Web Service** → connectez votre dépôt GitHub.

4. Paramètres :
   | Champ | Valeur |
   |-------|--------|
   | **Name** | `mot-de-la-fin` |
   | **Runtime** | Node |
   | **Build Command** | `npm install` |
   | **Start Command** | `npm start` |
   | **Instance Type** | Free |

5. Cliquez **Create Web Service**. Après 2–3 min, vous obtenez une URL du type :
   ```
   https://mot-de-la-fin.onrender.com
   ```

6. **Partagez cette URL** à vos amis dans le monde entier.

> **Note Render gratuit** : le serveur s’endort après ~15 min sans joueurs. Le premier accès peut prendre 30–60 s (réveil). Pour une fête entre amis, prévoyez d’ouvrir la page 1 min avant.

---

### Option 2 — Railway.app

1. Compte sur [railway.app](https://railway.app)
2. **New Project → Deploy from GitHub**
3. Sélectionnez le repo, Railway détecte Node automatiquement
4. Variable `PORT` est gérée automatiquement
5. Domaine public généré dans **Settings → Networking → Generate Domain**

Crédit gratuit mensuel (~5 $) — suffisant pour des soirées jeux.

---

### Option 3 — Fly.io

```bash
# Installer flyctl : https://fly.io/docs/hands-on/install-flyctl/
cd mot-de-la-fin-online
fly launch
fly deploy
```

Plan gratuit limité mais performant.

---

### Option 4 — Glitch.com (sans GitHub)

1. Allez sur [glitch.com](https://glitch.com)
2. **New Project → Import from GitHub** ou uploadez les fichiers
3. Glitch lance `npm start` automatiquement
4. URL : `https://votre-projet.glitch.me`

Très simple pour tester, moins stable pour beaucoup de joueurs simultanés.

---

## Comment jouer en ligne (pour vos amis)

1. **L’hôte** ouvre le site → **Créer une salle**
2. Il **copie le code** (ex. `AB3K9P`) ou le **lien** et l’envoie sur Discord / WhatsApp / SMS
3. Les amis cliquent le lien ou entrent le code + leur pseudo
4. Dans le salon : chacun choisit son **équipe**
5. L’hôte règle le chrono / difficulté → **Lancer la partie**
6. **Conseil** : lancez un appel Discord / Zoom en parallèle pour parler ! Seule l’équipe qui joue voit le mot à l’écran.

---

## Fonctionnement technique

| Composant | Technologie |
|-----------|-------------|
| Serveur | Node.js + Express |
| Temps réel | Socket.io (WebSockets) |
| Hébergement | Render / Railway / Fly (gratuit) |
| Mots | 286 cartes (`mots.json`) |

Le mot à deviner n’est envoyé qu’aux joueurs de **l’équipe active** — les autres voient seulement le chrono et les scores.

---

## Structure du projet

```
mot-de-la-fin-online/
├── server.js          # Serveur + logique multijoueur
├── mots.json          # Base de mots
├── package.json
├── public/
│   ├── index.html     # Interface
│   ├── app.js         # Client Socket.io
│   └── style.css
└── README.md
```

---

## Limites du plan gratuit

- ~20–50 joueurs simultanés selon l’hébergeur (largement suffisant pour des soirées entre amis)
- Salles en mémoire : si le serveur redémarre, les parties en cours sont perdues
- Pas de compte utilisateur (pseudo seulement, comme StopotS)

Pour aller plus loin (base de données, comptes, domaine perso), on pourra ajouter Supabase ou un nom de domaine (~10 €/an).
