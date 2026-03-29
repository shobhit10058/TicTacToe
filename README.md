# Multiplayer Tic-Tac-Toe

A real-time, server-authoritative multiplayer Tic-Tac-Toe game.

**Stack:** Nakama game server (TypeScript runtime plugin) · React 18 + Vite + TypeScript · PostgreSQL · Docker Compose

**Bonus features implemented:** timed game mode (30 s/turn with server-enforced forfeit), global leaderboard, per-player win/loss/streak statistics, concurrent match support.

---

## Table of Contents

1. [Setup and Installation](#1-setup-and-installation)
2. [Architecture and Design Decisions](#2-architecture-and-design-decisions)
3. [Deployment](#3-deployment)
4. [API and Server Configuration](#4-api-and-server-configuration)
5. [Testing Multiplayer Functionality](#5-testing-multiplayer-functionality)

---

## 1. Setup and Installation

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | 4.x (Compose v2) | Runs Nakama + PostgreSQL |
| [Node.js](https://nodejs.org/) | 20 or 22 LTS | Runs the React dev server |

No Go, no Java, no other runtimes required.

### Clone and start

```bash
git clone <repo-url>
cd TicTacToe
```

**Step 1 — Start the backend (Nakama + PostgreSQL)**

```bash
docker compose up --build
```

First run takes ~2 minutes (downloads images, compiles the TypeScript plugin, runs DB migrations). Subsequent starts are fast.

You should see:

```
nakama-1  | {"msg":"Startup done"}
```

**Step 2 — Start the frontend**

```bash
cd web
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

### Verify it's running

| URL | What you should see |
|-----|---------------------|
| http://localhost:3000 | Login screen |
| http://localhost:7351 | Nakama admin console (login: `admin` / `password`) |
| http://localhost:7350/healthcheck | `{}` (HTTP 200) |

### Stopping

```bash
docker compose down          # stop containers, keep data
docker compose down -v       # stop containers, delete database
```

### Frontend environment variables

Create `web/.env.local` to override any default:

```env
VITE_NAKAMA_HOST=localhost   # Nakama server hostname
VITE_NAKAMA_PORT=7350        # Nakama HTTP/WS port
VITE_NAKAMA_KEY=defaultkey   # Nakama server key (must match local.yml)
VITE_USE_SSL=false           # Set true when behind HTTPS
```

The app reads these at build time via Vite's `import.meta.env`. No restart needed for `.env.local` changes — Vite hot-reloads them.

---

## 2. Architecture and Design Decisions

### System overview

```
Browser (React 18 + Vite)
        │
        │  WebSocket — Nakama JS SDK v2.8
        ▼
Nakama Server  :7350
        │
        │  TypeScript runtime plugin (ES5 bundle via tsc --outFile)
        ▼
TicTacToeMatch  ← server-authoritative state machine
        │
        ▼
PostgreSQL  (accounts · key-value storage · leaderboards)
```

### Directory structure

```
.
├── docker-compose.yml          # Nakama + PostgreSQL services
├── nakama/
│   ├── Dockerfile              # Multi-stage: Node builder → Nakama image
│   └── local.yml               # Nakama runtime config (server key, logger, etc.)
├── server/                     # TypeScript Nakama plugin
│   ├── tsconfig.json           # ES5 target, outFile bundle — official Heroic Labs approach
│   └── src/
│       ├── board.ts            # Pure game logic: newBoard, applyMove, checkOutcome
│       ├── match.ts            # Match lifecycle, timer, stats, leaderboard, RPCs
│       └── main.ts             # InitModule: registers all handlers and RPCs
└── web/                        # React frontend
    └── src/
        ├── App.tsx             # Screen state machine (login→lobby→game→game-over)
        ├── protocol/types.ts   # Shared op codes + message interfaces
        ├── game/reducer.ts     # Pure state reducer, zero framework imports
        ├── hooks/
        │   ├── useNakama.ts    # Device auth + WebSocket connection
        │   ├── useMatch.ts     # Full match lifecycle, optimistic moves, mode
        │   └── useLeaderboard.ts
        └── components/
            ├── LobbyScreen.tsx      # Mode selector (Classic / Timed)
            ├── GameScreen.tsx       # Board + countdown timer
            ├── LeaderboardScreen.tsx
            └── GameOver.tsx
```

### Match lifecycle

```
matchInit          → allocate board, phase = 'waiting'
matchJoinAttempt   → reject if match is full or finished
matchJoin          → assign X / O; start game when 2nd player arrives
matchLoop (2 Hz)   → process MOVE messages; enforce timer deadline
matchLeave         → forfeit win to remaining player
matchTerminate     → cleanup
```

### Message protocol

```
Client A              Nakama                Client B
   │── MOVE(cell) ──► │                        │
   │                  │  validate + apply       │
   │ ◄── GAME_STATE ──│── GAME_STATE ──────────►│
   │ ◄── GAME_OVER ───│── GAME_OVER ───────────►│  (on win/draw/timeout)
```

Op codes: `MOVE=1  GAME_STATE=2  GAME_OVER=3  ERROR=4`

### Key design decisions

| Decision | Rationale |
|----------|-----------|
| **TypeScript runtime (not Go)** | Uniform codebase; official Heroic Labs approach using `tsc --outFile` (ES5, no webpack) |
| **Server-authoritative** | All move validation and win detection on server — clients cannot cheat |
| **Optimistic UI** | Client shows a pending move instantly; corrected on next server broadcast |
| **Pure reducer** (`reducer.ts`) | Zero React/SDK imports — fully unit-testable without mocks |
| **Username-derived device ID** | Same username always maps to the same Nakama account (login semantics); different usernames get separate accounts for multi-tab testing |
| **Single-session enforcement** | `beforeAuthenticateDevice` hook atomically rejects authentication if the username already has an active WebSocket connection |
| **Epoch timestamp for timer** | Server stores deadline as absolute epoch ms; re-checked every `matchLoop` tick. Client countdown is display-only |
| **`SET` leaderboard operator** | Re-running the write after any game is idempotent — no double-counting wins |
| **Nakama built-in matchmaker** | Handles edge cases (disconnect during search, concurrent tickets) for free |
| **Mode-scoped matchmaker query** | `+properties.mode:timed` ensures timed players only match timed players |

### Mobile responsiveness

The UI is built mobile-first using flexbox layouts, `maxWidth` card constraints (360px), and `clamp()` for responsive font sizing. A global `mobile.css` layer adds device-specific polish:

- **Touch**: `touch-action: manipulation` on all buttons/inputs to eliminate the 300ms double-tap zoom delay
- **Notched phones**: `env(safe-area-inset-*)` body padding for iPhone X+ notch and home indicator
- **Small screens**: Font size reduction via `@media (max-width: 380px)` for devices like iPhone SE
- **Orientation change**: `text-size-adjust: 100%` prevents iOS from auto-resizing text on rotate
- **Tap targets**: All interactive elements have a minimum height of 48px (meets WCAG touch target guidelines)

---

## 3. Deployment

### Deployed instance

| Resource | URL |
| --- | --- |
| Game (frontend) | **[https://realtictactoe.mooo.com](https://realtictactoe.mooo.com)** |
| Nakama API endpoint | `https://realtictactoe.mooo.com/v2/` (proxied by nginx) |
| Nakama healthcheck | `https://realtictactoe.mooo.com/healthcheck` |
| Nakama WebSocket | `wss://realtictactoe.mooo.com/ws` (proxied by nginx) |

Open two browser tabs to the game URL and play a match.

### AWS EC2 deployment (what was actually done)

The backend runs on an AWS EC2 **t3.small** (Ubuntu 22.04, 2 GB RAM, 15 GB volume). The frontend is served by nginx on the same instance.

nginx acts as a reverse proxy — all public traffic goes through port 443 (HTTPS). Nakama is never exposed directly; nginx routes internally:

| Public path | Internal target |
| --- | --- |
| `https://realtictactoe.mooo.com/` | nginx → `dist/` static files |
| `https://realtictactoe.mooo.com/v2/` | nginx → `http://127.0.0.1:7350` (Nakama REST) |
| `https://realtictactoe.mooo.com/healthcheck` | nginx → `http://127.0.0.1:7350/healthcheck` |
| `wss://realtictactoe.mooo.com/ws` | nginx → `ws://127.0.0.1:7350/ws` (Nakama WebSocket) |

The Nakama admin console (port 7351) is **intentionally not exposed publicly**. Routing it through nginx would allow unlimited login attempts against the admin credentials with no brute-force protection. Access is restricted to an SSH tunnel:

```bash
ssh -i <your-key.pem> -L 7351:localhost:7351 ubuntu@realtictactoe.mooo.com
```

Then open `http://localhost:7351` in your browser (login: `admin` / `password`).

#### 1. Launch EC2 instance

- AMI: Ubuntu 22.04 LTS
- Instance type: t3.small (2 vCPU, 2 GB RAM, 15 GB EBS volume)
- Security group inbound rules:

| Port | Protocol | Source    | Purpose              |
|------|----------|-----------|----------------------|
| 22   | TCP      | Your IP   | SSH                  |
| 80   | TCP      | 0.0.0.0/0 | nginx / certbot      |
| 443  | TCP      | 0.0.0.0/0 | nginx HTTPS          |

#### 2. Install Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo usermod -aG docker $USER
newgrp docker
```

#### 3. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

#### 4. Clone and start the backend

```bash
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>
docker compose up --build -d
```

Wait for:

```text
nakama-1  | {"msg":"Startup done"}
```

Verify Nakama is reachable:

```bash
curl http://localhost:7350/healthcheck
# → {}
```

#### 5. Get a free domain

Sign up at [FreeDNS (freedns.afraid.org)](https://freedns.afraid.org/subdomain/) and create a subdomain (e.g. `realtictactoe.mooo.com`) pointing to your EC2 public IP.

#### 6. Set up nginx

```bash
sudo apt install -y nginx
sudo mkdir -p /var/www/realtictactoe

# Create site config
sudo tee /etc/nginx/sites-available/realtictactoe > /dev/null << 'EOF'
server {
    listen 80;
    server_name realtictactoe.mooo.com;

    root /var/www/realtictactoe;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /v2/ {
        proxy_pass http://127.0.0.1:7350;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /healthcheck {
        proxy_pass http://127.0.0.1:7350/healthcheck;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /ws {
        proxy_pass http://127.0.0.1:7350/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/realtictactoe /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

#### 7. Add HTTPS with certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d realtictactoe.mooo.com
```

Certbot automatically adds SSL to the nginx config and sets up HTTP → HTTPS redirect. Certificates auto-renew via a systemd timer.

#### 8. Build and deploy the frontend

```bash
cd ~/TicTacToe/web
npm install

VITE_NAKAMA_HOST=realtictactoe.mooo.com \
VITE_NAKAMA_PORT=443 \
VITE_NAKAMA_KEY=defaultkey \
VITE_USE_SSL=true \
npm run build

sudo cp -r dist/* /var/www/realtictactoe/
```

The app is now live at `https://realtictactoe.mooo.com`.

#### Redeploying after frontend changes

```bash
cd web
npm run build
sudo cp -r dist/* /var/www/realtictactoe/
```

#### Redeploying after server changes

```bash
docker compose down
docker compose up --build -d
```

### Dockerfile overview

The `nakama/Dockerfile` is a two-stage build:

1. **`node:22-alpine`** — installs dependencies and runs `tsc`
2. **`heroiclabs/nakama:3.38.0`** — copies the compiled `index.js` bundle; Node.js is not in the final image

---

## 4. API and Server Configuration

### Nakama configuration (`nakama/local.yml`)

```yaml
name: nakama1
data_dir: /nakama/data

logger:
  level: DEBUG          # Change to INFO / WARN in production

session:
  token_expiry_sec: 7200

runtime:
  js_entrypoint: index.js   # The compiled TypeScript bundle

console:
  username: admin
  password: password        # Change in production
```

Key flags passed at startup (in `docker-compose.yml`):

| Flag | Value | Description |
|------|-------|-------------|
| `--database.address` | `postgres:localdb@postgres:5432/nakama` | PostgreSQL connection string |
| `--session.token_expiry_sec` | `7200` | Session lifetime (2 hours) |
| `--runtime.path` | `/nakama/data/modules` | Directory containing `index.js` |

### Ports

| Port | Protocol | Service |
|------|----------|---------|
| `7349` | gRPC | Nakama gRPC API |
| `7350` | HTTP + WebSocket | Nakama HTTP API + real-time socket |
| `7351` | HTTP | Nakama admin console |

### RPCs (callable from the client)

| RPC ID | Method | Input | Output |
|--------|--------|-------|--------|
| `find_match` | POST | `{ "mode": "classic" \| "timed" }` | `{ "match_id": "..." }` |
| `create_match` | POST | `{ "mode": "classic" \| "timed" }` | `{ "match_id": "..." }` |
| `get_my_stats` | POST | `{}` | `{ wins, losses, draws, currentStreak, bestStreak, gamesPlayed }` |
| `get_leaderboard` | POST | `{}` | `{ "records": [{ rank, username, wins }] }` |
| `check_online` | POST | `{}` | Returns `{ "online": false }` when the user has no active WebSocket (login allowed). Returns `{ "error": "This username already has an active session" }` when the user is already connected (login blocked). Note: single-session enforcement is now handled atomically by the `beforeAuthenticateDevice` hook; this RPC is retained for informational/debugging use. |

Call via HTTP (useful for debugging):

```bash
curl -X POST http://localhost:7350/v2/rpc/get_leaderboard \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Nakama storage schema

| Collection | Key | Permission | Contents |
|------------|-----|------------|----------|
| `player_stats` | `game_stats` | Read: public · Write: server-only | `{ wins, losses, draws, currentStreak, bestStreak, gamesPlayed }` |

### Leaderboard

| ID | Sort | Operator | Reset |
|----|------|----------|-------|
| `tictactoe_wins` | Descending | SET (overwrite) | Never |

### Authentication

The client uses **device authentication** with a deterministic device ID derived from the username (`nakama_user_<username>`). Entering the same username always resolves to the same Nakama account (login semantics). Different usernames map to different accounts, so two browser tabs with different names can play against each other.

Single-session enforcement is handled atomically by a server-side `beforeAuthenticateDevice` hook. During authentication, the hook checks whether the username already has an active WebSocket connection; if so, the authentication itself is rejected before a session token is issued. This eliminates the TOCTOU race that would exist with a separate post-auth RPC. A legacy `check_online` RPC is still available for informational/debugging use.

### Server key

The default server key is `defaultkey` (set in `local.yml` and matched by `VITE_NAKAMA_KEY`). Change both in production.

---

## 5. Testing Multiplayer Functionality

### Quick-start: two players in the same browser

Because device IDs are derived from the username, you can test a full game with two browser tabs using different names:

1. `docker compose up --build` (wait for `Startup done`)
2. `cd web && npm install && npm run dev`
3. Open **Tab A**: http://localhost:3000 → enter name **"Alice"** → Login
4. Open **Tab B**: http://localhost:3000 → enter name **"Bob"** → Login
5. In **both tabs**: select the same mode (Classic or Timed) → click **Quick match**
6. Both transition to the game board within a few seconds

> If you want genuinely separate browsers, use Chrome + Firefox, or Chrome + an incognito window.

### Scenario checklist

| Scenario | How to test | Expected result |
|----------|-------------|-----------------|
| **Normal game — X wins** | Alice and Bob alternate moves; Alice completes a row | Game Over screen shows Alice as winner; both stats updated |
| **Draw** | Fill all 9 cells with no winner | Game Over screen shows "Draw"; draw count incremented for both |
| **Timed mode — timeout** | Select Timed, let the clock run out on one player's turn | Opponent wins automatically; Game Over screen appears within ~500 ms of deadline |
| **Disconnect forfeit** | During a game, close Tab B | Tab A shows "Opponent disconnected"; Tab A player wins |
| **Invalid move** | (Browser console) Send `MOVE` to an already-occupied cell | Server returns ERROR; board unchanged |
| **Private room** | Tab A: Create private room → copy ID. Tab B: paste ID → Join | Both enter the same match |
| **Leaderboard** | Play several games, then open Leaderboard | Rankings and personal stats reflect completed games |
| **Mode isolation** | Tab A: Quick match (Classic). Tab B: Quick match (Timed) | Tabs are NOT matched — they wait until a same-mode player joins |
| **Duplicate username blocked** | Tab A: login as "Alice". Tab B: try login as "Alice" | Tab B shows error "This username already has an active session" |
| **Re-login after disconnect** | Login as "Alice", close tab, open new tab, login as "Alice" again | Login succeeds — same account, stats preserved |

### Unit tests

```bash
# Verify the server plugin compiles cleanly
cd server && npm install && npm run build

# Run frontend unit tests (Vitest) — 29 tests across 3 suites
cd web && npm test
```

All tests run without a Nakama instance.

| Test suite | What it covers | Tests |
|------------|---------------|-------|
| `board-logic.test.ts` | `applyMove` validation (bounds, occupied cell, invalid symbol), `checkOutcome` for all 8 win lines, draws, and in-progress detection, board immutability | 20 |
| `reducer.test.ts` | `applyServerState` — symbol assignment, pending cell clearing, win/draw/waiting phase transitions, timed mode defaults | 6 |
| `types.test.ts` | Op code values match server constants, uniqueness, positive integers | 3 |

The board logic tests import directly from `server/src/board.ts` (single source of truth). A vitest plugin in `vitest.config.ts` auto-appends exports at test time so the server source stays unchanged for Nakama's `outFile` build.

### Nakama admin console

While a game is in progress, open http://localhost:7351 (admin / password):

- **Runtime → Matches** — lists all active matches with current state
- **Storage** — inspect `player_stats / game_stats` records directly
- **Leaderboard** — view `tictactoe_wins` entries

### Observing server logs

```bash
docker compose logs -f nakama
```

Key log lines to watch:

| Log message | Meaning |
|-------------|---------|
| `Match initialised (mode: timed)` | Match created with correct mode |
| `Player X joined: <uid>` | First player seated |
| `Player O joined: <uid>` | Second player seated; game starts |
| `Turn timeout: player <uid> forfeits` | Timer expiry enforced |
| `Player <uid> left; winner by forfeit` | Disconnect handled |

---

## Features at a glance

| Feature | Status |
|---------|--------|
| Real-time WebSocket gameplay | Core |
| Server-authoritative move validation | Core |
| Quick match (built-in matchmaker) | Core |
| Private rooms (share room ID) | Core |
| Classic mode | Core |
| Timed mode — 30 s/turn, server-enforced forfeit | Bonus |
| Global leaderboard (top 10 by wins) | Bonus |
| Per-player statistics (W/L/D/streaks) | Bonus |
| Concurrent independent games | Bonus |
| Disconnect → forfeit win | Core |
| Optimistic UI (instant pending move) | Core |
| Single-session enforcement | Core |

---

## 6. Edge Cases and Validations

### Authentication & Sessions

| Edge Case | How it's handled |
|-----------|-----------------|
| **Re-login with existing username** | Device ID is derived from the username (`nakama_user_<name>`), so the same username always resolves to the same account — no "username already taken" error |
| **Duplicate active session** | Server-side `beforeAuthenticateDevice` hook checks `user.online` during authentication itself (atomic, no TOCTOU race). If the username already has an active WebSocket connection, the authentication is rejected before a session token is issued |
| **Symbol spoofing** | Client only sends `{ cell }`. The server assigns symbols at join time and looks up the correct one from the sender's user ID |
| **Self-matching** | `matchJoinAttempt` rejects a user who is already seated in the match |
| **Duplicate in-flight move** | Client blocks sending a second move while a previous optimistic move is pending |
| **Mode mismatch in matchmaker** | Matchmaker query uses `+properties.mode:<mode>` so timed and classic players never cross-match |
| **Stats tampering** | Player stats storage has `permissionWrite: 0` (server-only). Clients cannot modify their own records |
| **No stack traces to client** | RPCs return structured `{ error: "..." }` JSON instead of throwing, preventing internals from leaking |
| **Race condition on opponent lookup** | Client verifies opponent ID hasn't changed during async username fetch before applying the result |
| **Disconnect mid-game** | `matchLeave` awards a forfeit win to the remaining player and records stats for both |
