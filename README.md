# Multiplayer Tic-Tac-Toe

A real-time, server-authoritative multiplayer Tic-Tac-Toe game built with:

- **Backend**: [Nakama](https://heroiclabs.com/nakama/) — TypeScript runtime plugin, authoritative match handler
- **Frontend**: React 18 + TypeScript + Vite
- **Infrastructure**: Docker Compose (Nakama + PostgreSQL)

---

## Features

| Feature | Notes |
|---------|-------|
| Real-time multiplayer | WebSocket via Nakama JS SDK |
| Server-authoritative moves | All validation + win detection server-side |
| Quick match (matchmaker) | Nakama built-in matchmaker pairs players automatically |
| Private rooms | Create a room, share the ID; friend pastes and joins |
| Classic mode | Standard Tic-Tac-Toe, no time limit |
| **Timed mode** (bonus) | Each player has 30 seconds per turn; timeout = forfeit |
| **Leaderboard** (bonus) | Top 10 by total wins, backed by Nakama's leaderboard API |
| **Player stats** (bonus) | Wins / losses / draws / current streak / best streak |
| Optimistic UI | Move renders instantly; corrected on server broadcast |
| Disconnect handling | Opponent leave → forfeit win for remaining player |

---

## Architecture

```
Browser (React + Vite)
    │
    │  WebSocket  (Nakama JS SDK v2.8)
    ▼
Nakama Server  :7350
    │
    │  TypeScript runtime  (goja/ES5 + outFile bundle)
    ▼
TicTacToeMatch  (server-authoritative match handler)
    │
    ▼
PostgreSQL  (sessions · storage · leaderboards)
```

### Message flow

```
Client A                  Nakama                   Client B
   │                         │                         │
   │── joinMatch ──────────► │                         │
   │                         │ ◄──────── joinMatch ────│
   │                         │                         │
   │  (2 players joined)     │                         │
   │ ◄── GAME_STATE ─────────│── GAME_STATE ──────────►│
   │                         │                         │
   │── MOVE { cell: 4 } ────►│                         │
   │                         │  (validate + apply)     │
   │ ◄── GAME_STATE ─────────│── GAME_STATE ──────────►│
   │                         │                         │
   │── MOVE (winning) ──────►│                         │
   │ ◄── GAME_OVER ──────────│── GAME_OVER ───────────►│
```

### Op codes

| Code | Name       | Direction       | Description                      |
|------|------------|-----------------|----------------------------------|
| 1    | MOVE       | Client → Server | Place a symbol on a cell         |
| 2    | GAME_STATE | Server → Both   | Authoritative board state update |
| 3    | GAME_OVER  | Server → Both   | Final state: winner or draw      |
| 4    | ERROR      | Server → Sender | Invalid move or rule violation   |

---

## Directory structure

```
.
├── .github/workflows/ci.yml    # CI: TypeScript build + web tests
├── docker-compose.yml          # Nakama + Postgres
├── nakama/
│   ├── Dockerfile              # Multi-stage: Node builder → Nakama image
│   └── local.yml               # Nakama runtime config
├── server/                     # TypeScript Nakama plugin
│   ├── package.json
│   ├── tsconfig.json           # outFile bundle, ES5 target (official Heroic Labs approach)
│   └── src/
│       ├── board.ts            # Pure game logic (newBoard, applyMove, checkOutcome)
│       ├── match.ts            # Match handler + stats + leaderboard + RPCs
│       └── main.ts             # InitModule: registers handler, matchmaker hook, RPCs
└── web/                        # React 18 + Vite + TypeScript
    └── src/
        ├── App.tsx             # Screen router (login → lobby → game → game-over)
        ├── protocol/types.ts   # Shared op codes and message interfaces
        ├── game/reducer.ts     # Pure state reducer (tested without DOM)
        ├── hooks/
        │   ├── useNakama.ts    # Auth + socket connection
        │   ├── useMatch.ts     # Match lifecycle, optimistic moves, mode selection
        │   └── useLeaderboard.ts # Leaderboard + player stats RPCs
        └── components/
            ├── LoginScreen.tsx
            ├── LobbyScreen.tsx     # Classic/Timed mode selector
            ├── GameScreen.tsx      # Board + countdown timer
            ├── Board.tsx / Cell.tsx
            ├── GameOver.tsx
            └── LeaderboardScreen.tsx
```

---

## Local development

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Compose v2)
- [Node.js](https://nodejs.org/) 20+

### 1. Start the backend

```bash
docker compose up --build
```

This will:
1. Compile the TypeScript plugin (`server/src/` → `build/index.js`)
2. Start PostgreSQL and run Nakama migrations
3. Start Nakama on ports `7349` (gRPC), `7350` (HTTP/WS), `7351` (console)

Nakama console: http://localhost:7351
Login: `admin` / `password`

### 2. Start the frontend

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000 in two browser tabs (or two different browsers) to play against yourself.

### Environment variables (optional)

Create `web/.env.local` to override defaults:

```env
VITE_NAKAMA_HOST=localhost
VITE_NAKAMA_PORT=7350
VITE_NAKAMA_KEY=defaultkey
VITE_USE_SSL=false
```

---

## Running tests

### TypeScript server (build check)

```bash
cd server
npm install
npm run build   # tsc — verifies the plugin compiles without errors
```

### Web (unit tests)

```bash
cd web
npm test
```

Runs Vitest against the pure reducer and protocol types.

---

## How to play

### Quick match

1. Open http://localhost:3000 in **Browser A**, enter a username, click **Login**.
2. Select **Classic** or **Timed (30s)**, then click **Quick match**.
3. Open http://localhost:3000 in **Browser B** (or incognito), log in with a different name.
4. Select the same mode, click **Quick match** — Nakama pairs the two tickets automatically.
5. Both screens transition to the board. **X goes first.**
6. Alternate clicking cells. The server validates every move and broadcasts state.
7. When someone wins (or it's a draw) the Game Over screen appears.

### Private room

1. Player A selects a mode, clicks **Create private room**, copies the room ID shown.
2. Player B pastes the ID into the Join field and clicks **Join**.

### Timed mode

Each player has **30 seconds** per turn. The server tracks the deadline; if a player's time expires the opponent wins automatically.

### Leaderboard

Click **Leaderboard** from the lobby to view the top 10 players by wins and your personal stats.

---

## Deployment

### Backend (Docker)

Build and push the server image:

```bash
docker build -f nakama/Dockerfile -t <registry>/tictactoe-nakama:latest .
docker push <registry>/tictactoe-nakama:latest
```

Replace the `build:` block in `docker-compose.yml` with `image: <registry>/tictactoe-nakama:latest` for production.

For cloud deployment (AWS ECS, GCP Cloud Run, DigitalOcean App Platform), point the Nakama container at an external managed PostgreSQL instance via the `--database.address` flag and set `NAKAMA_CONSOLE_PASSWORD` for security.

### Frontend (static)

```bash
cd web
VITE_NAKAMA_HOST=your.nakama.host \
VITE_NAKAMA_PORT=443 \
VITE_NAKAMA_KEY=your-server-key \
VITE_USE_SSL=true \
npm run build
```

Serve `web/dist/` from any static host — Vercel, Netlify, S3 + CloudFront, or Nginx.

---

## Protocol reference

### MOVE (client → server, op 1)

```json
{ "cell": 4 }
```

`cell` is a 0-indexed integer in row-major order:

```
0 | 1 | 2
---------
3 | 4 | 5
---------
6 | 7 | 8
```

### GAME_STATE / GAME_OVER (server → both clients, op 2 / 3)

```json
{
  "board":            ["X", "", "", "", "O", "", "", "", "X"],
  "current_turn":     "<user_id>",
  "symbols":          { "<user_id_1>": "X", "<user_id_2>": "O" },
  "phase":            "playing",
  "winner":           "",
  "move_count":       3,
  "timed_mode":       true,
  "turn_deadline_ms": 1711234567890
}
```

`phase`: `"waiting"` | `"playing"` | `"finished"`
`winner`: `<user_id>` | `"draw"` | `""`
`turn_deadline_ms`: epoch ms when the current turn expires (`0` in classic mode or after game over)

### ERROR (server → requesting client only, op 4)

```json
{ "message": "Not your turn" }
```

### RPCs

| RPC id           | Input                | Output                                        |
|------------------|----------------------|-----------------------------------------------|
| `find_match`     | `{ "mode": "classic" \| "timed" }` | `{ "match_id": "..." }`       |
| `create_match`   | `{ "mode": "classic" \| "timed" }` | `{ "match_id": "..." }`       |
| `get_my_stats`   | `{}`                 | `{ wins, losses, draws, currentStreak, bestStreak, gamesPlayed }` |
| `get_leaderboard`| `{}`                 | `{ "records": [{ rank, username, wins }] }`   |

---

## Design decisions

- **TypeScript runtime**: the entire server plugin is TypeScript compiled with `tsc --outFile` (official Heroic Labs approach). No webpack. The output is a single ES5 bundle that Nakama's embedded goja engine executes directly.
- **Server-authoritative**: all move validation and win detection run on the server. The client cannot win by sending a fabricated state.
- **Optimistic UI**: the client renders a pending move immediately so the game feels instant; it is replaced by the authoritative server broadcast on the next tick.
- **Pure reducer**: `web/src/game/reducer.ts` has zero React or Nakama SDK imports — fully unit-testable with no mocks.
- **Device-ID auth**: a random UUID stored in `localStorage` gives the same user the same Nakama account across page reloads without a password flow.
- **Timer enforcement**: the deadline is stored in match state as an epoch timestamp and re-checked on every `matchLoop` tick (2 Hz). No client-side enforcement — the client only displays a countdown.
- **Stats storage**: per-player stats are stored in Nakama's key-value storage (`player_stats / game_stats`) with public read so the leaderboard can surface them.
