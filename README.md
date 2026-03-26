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
cd lilaGameAssignment
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
| **`sessionStorage` for device ID** | Each browser tab gets its own Nakama account, enabling two-tab local testing |
| **Epoch timestamp for timer** | Server stores deadline as absolute epoch ms; re-checked every `matchLoop` tick. Client countdown is display-only |
| **`SET` leaderboard operator** | Re-running the write after any game is idempotent — no double-counting wins |
| **Nakama built-in matchmaker** | Handles edge cases (disconnect during search, concurrent tickets) for free |
| **Mode-scoped matchmaker query** | `+properties.mode:timed` ensures timed players only match timed players |

---

## 3. Deployment

### Build the server image

The `nakama/Dockerfile` is a two-stage build:
1. **`node:22-alpine`** — installs dependencies and runs `tsc`
2. **`heroiclabs/nakama:3.38.0`** — copies the compiled `index.js` bundle; Node.js is not in the final image

```bash
# Build and tag
docker build -f nakama/Dockerfile -t <your-registry>/tictactoe-nakama:latest .

# Push to registry
docker push <your-registry>/tictactoe-nakama:latest
```

### Production docker-compose.yml

Replace the `build:` block with `image:` for the nakama service:

```yaml
nakama:
  image: <your-registry>/tictactoe-nakama:latest
  entrypoint:
    - "/bin/sh"
    - "-ecx"
    - >
      /nakama/nakama migrate up --database.address postgres:${DB_PASSWORD}@${DB_HOST}:5432/nakama &&
      exec /nakama/nakama
      --database.address postgres:${DB_PASSWORD}@${DB_HOST}:5432/nakama
      --session.token_expiry_sec 7200
      --runtime.path /nakama/data/modules
      --config /nakama/data/modules/local.yml
  environment:
    - DB_HOST=<your-postgres-host>
    - DB_PASSWORD=<your-password>
```

### Cloud deployment (example: DigitalOcean / AWS ECS)

1. Provision a managed PostgreSQL instance.
2. Push the Nakama image to your registry.
3. Deploy as a container service, set `--database.address` to point at the managed DB.
4. Expose port `7350` (HTTP/WS). Optionally put a TLS-terminating load balancer in front on port `443`.
5. Set the `NAKAMA_CONSOLE_PASSWORD` environment variable to secure the admin console.

### Build and deploy the frontend

```bash
cd web
VITE_NAKAMA_HOST=your.nakama.host \
VITE_NAKAMA_PORT=443 \
VITE_NAKAMA_KEY=your-server-key \
VITE_USE_SSL=true \
npm run build
```

This produces a static `web/dist/` folder. Deploy it to any static host:

| Host | Command |
|------|---------|
| **Vercel** | `vercel --prod web/dist` |
| **Netlify** | `netlify deploy --prod --dir web/dist` |
| **S3 + CloudFront** | `aws s3 sync web/dist s3://your-bucket --delete` |
| **Nginx** | Serve `web/dist` as document root with `try_files $uri /index.html` |

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

The client uses **device authentication** — a random UUID stored in `sessionStorage` is passed to `authenticateDevice`. Each browser tab gets its own UUID (and therefore its own Nakama account), which allows two tabs in the same browser to play against each other during development.

### Server key

The default server key is `defaultkey` (set in `local.yml` and matched by `VITE_NAKAMA_KEY`). Change both in production.

---

## 5. Testing Multiplayer Functionality

### Quick-start: two players in the same browser

Because device IDs are stored in `sessionStorage` (per-tab), you can test a full game with two browser tabs:

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

### Unit tests

```bash
# Verify the server plugin compiles cleanly
cd server && npm install && npm run build

# Run frontend unit tests (Vitest)
cd web && npm test
```

The frontend tests cover the pure game state reducer (`reducer.test.ts`) and protocol op code constants. They run without a Nakama instance.

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
