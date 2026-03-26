# Multiplayer Tic-Tac-Toe

A real-time, server-authoritative multiplayer Tic-Tac-Toe game built with:

- **Backend**: [Nakama](https://heroiclabs.com/nakama/) (Go plugin, authoritative match handler)
- **Frontend**: React 18 + TypeScript + Vite
- **Infrastructure**: Docker Compose (Nakama + PostgreSQL)

---

## Architecture

```
Browser (React)
    |
    | WebSocket (Nakama JS SDK)
    v
Nakama Server  (:7350)
    |
    | Go plugin (.so)
    v
TicTacToeMatch  (server-authoritative)
    |
    v
PostgreSQL  (sessions, leaderboards, storage)
```

### Message flow

```
Client A                  Nakama                   Client B
   |                         |                         |
   |-- joinMatch ----------->|                         |
   |                         |<------- joinMatch -------|
   |                         |                         |
   |  (2 players joined)     |                         |
   |<-- GAME_STATE (playing) |-- GAME_STATE (playing) ->|
   |                         |                         |
   |-- MOVE { cell: 4 } ---->|                         |
   |                         | (validate + apply)      |
   |<-- GAME_STATE ----------|-- GAME_STATE ----------->|
   |                         |                         |
   ...                       ...                       ...
   |-- MOVE (winning move) ->|                         |
   |<-- GAME_OVER -----------|-- GAME_OVER ------------>|
```

### Op codes

| Code | Name           | Direction        | Description                          |
|------|----------------|------------------|--------------------------------------|
| 1    | MOVE           | Client → Server  | Player places a symbol on a cell     |
| 2    | GAME_STATE     | Server → Clients | Authoritative board state update     |
| 3    | GAME_OVER      | Server → Clients | Final state: winner or draw          |
| 4    | ERROR          | Server → Client  | Invalid move or rule violation       |
| 5    | PLAYER_READY   | (reserved)       | Future use                           |
| 6    | OPPONENT_LEFT  | (reserved)       | Future use                           |

---

## Directory structure

```
.
├── .github/workflows/ci.yml    # GitHub Actions: Go tests + web tests + build
├── docker-compose.yml          # Nakama + Postgres
├── nakama/
│   ├── Dockerfile              # Builds Go plugin, bundles with Nakama image
│   └── local.yml               # Nakama runtime config
├── server/                     # Go Nakama plugin
│   ├── go.mod
│   ├── main.go                 # InitModule: registers match handler + RPCs
│   ├── match_tictactoe.go      # Server-authoritative match implementation
│   └── tictactoe/
│       ├── board.go            # Pure game logic (Board, ApplyMove, CheckOutcome)
│       └── board_test.go       # Comprehensive unit tests
└── web/                        # React + Vite + TypeScript
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx             # Top-level state machine / screen router
    │   ├── protocol/
    │   │   └── types.ts        # Shared op codes and message interfaces
    │   ├── game/
    │   │   └── reducer.ts      # Pure state reducer (testable without DOM)
    │   ├── hooks/
    │   │   ├── useNakama.ts    # Auth + socket connection
    │   │   └── useMatch.ts     # Match lifecycle + optimistic moves
    │   └── components/
    │       ├── LoginScreen.tsx
    │       ├── LobbyScreen.tsx
    │       ├── GameScreen.tsx
    │       ├── Board.tsx
    │       ├── Cell.tsx
    │       └── GameOver.tsx
    └── ...config files
```

---

## Local development

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with Compose v2)
- [Node.js](https://nodejs.org/) 20+
- [Go](https://go.dev/) 1.21+ (optional — only needed to run Go tests locally)

### 1. Start the backend

```bash
docker compose up --build
```

This will:
1. Build the Go plugin (`server/` → `backend.so`)
2. Start PostgreSQL
3. Run Nakama migrations
4. Start Nakama on ports `7349` (gRPC), `7350` (HTTP/WS), `7351` (console)

Nakama console: http://localhost:7351
Login: `admin` / `password`

### 2. Start the frontend

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000 in two browser tabs (or two different browsers) to play against yourself.

### Environment variables (frontend)

Create `web/.env.local` to override defaults:

```
VITE_NAKAMA_HOST=localhost
VITE_NAKAMA_PORT=7350
VITE_NAKAMA_KEY=defaultkey
VITE_USE_SSL=false
```

---

## Running tests

### Go (server)

```bash
cd server
go test ./tictactoe/...
```

Expected output: all tests pass (board logic, win detection, draw detection).

### TypeScript (web)

```bash
cd web
npm test
```

Runs Vitest against:
- `src/protocol/types.test.ts` — op code constants
- `src/game/reducer.test.ts` — pure game state reducer

---

## How to play multiplayer

1. Open http://localhost:3000 in **Browser A** and enter a name.
2. Click **Quick match** — the server creates a match and you wait.
3. Open http://localhost:3000 in **Browser B** (or incognito) and enter a different name.
4. Click **Quick match** — the server finds the waiting match and joins you in.
5. Both screens transition to the game board. X goes first.
6. Alternate clicking cells. The server validates every move.
7. When someone wins (or it's a draw), the Game Over screen appears with a **Play again** button.

### Private room

1. Player A clicks **Create private room** and copies the room ID.
2. Player B pastes the room ID in the **Join** field and clicks **Join**.

---

## Deployment

### Docker (production)

Build and push the Nakama image with the embedded plugin:

```bash
docker build -f nakama/Dockerfile -t your-registry/tictactoe-nakama:latest .
docker push your-registry/tictactoe-nakama:latest
```

Update `docker-compose.yml` to use `image:` instead of `build:` for the nakama service.

### Frontend (static)

```bash
cd web
VITE_NAKAMA_HOST=your.nakama.host \
VITE_NAKAMA_PORT=443 \
VITE_NAKAMA_KEY=your-server-key \
VITE_USE_SSL=true \
npm run build
```

Serve `web/dist/` from any static host (Vercel, Netlify, S3 + CloudFront, etc.).

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

### GAME_STATE / GAME_OVER (server → clients, op 2 / 3)

```json
{
  "board": ["X", "", "", "", "O", "", "", "", "X"],
  "current_turn": "<user_id>",
  "symbols": {
    "<user_id_1>": "X",
    "<user_id_2>": "O"
  },
  "phase": "playing",
  "winner": "",
  "move_count": 3
}
```

`phase` values: `"waiting"` | `"playing"` | `"finished"`
`winner` values: `<user_id>` | `"draw"` | `""`

### ERROR (server → requesting client only, op 4)

```json
{ "message": "Not your turn" }
```

---

## Design decisions

- **Server-authoritative**: all move validation and win detection happen in Go on the server. The client cannot cheat by sending fabricated states.
- **Optimistic UI**: the client renders an immediate visual placeholder (`·`) for the pending cell so the game feels instant over LAN; it is replaced by the authoritative state on the next server broadcast.
- **Value semantics for board**: `tictactoe.Board` uses a fixed `[9]string` array (not a slice/pointer), so `ApplyMove` never mutates the original — making the Go logic easy to reason about and test.
- **Pure reducer**: `web/src/game/reducer.ts` contains zero React or Nakama SDK imports, making it straightforward to unit-test without any test doubles.
- **Device ID persistence**: the frontend stores a random UUID in `localStorage` so the same user gets the same Nakama account across page reloads without requiring a password.
