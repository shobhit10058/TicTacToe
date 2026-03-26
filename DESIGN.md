# Design Document — Multiplayer Tic-Tac-Toe

## 1. Overview

A real-time, server-authoritative multiplayer Tic-Tac-Toe game. Two players connect over WebSocket through a Nakama game server. All game logic — move validation, win detection, turn enforcement, and timer management — runs exclusively on the server. The frontend is a thin display layer that sends user input and renders authoritative state.

---

## 2. Feature Breakdown

### Core features (required)

#### Real-time multiplayer over WebSocket
Players communicate with Nakama over a persistent WebSocket connection managed by the Nakama JS SDK. All game events (moves, state updates, game-over) are pushed from the server — the client never polls.

#### Server-authoritative match handler
Every move is validated on the server inside `matchLoop`. The server checks: is the game in the `playing` phase? Is this the sender's turn? Is the target cell empty? Only if all checks pass does the board update. The client cannot influence the game state directly — it only sends a cell index.

#### Win and draw detection
`checkOutcome` in `board.ts` checks all 8 winning lines (3 rows, 3 columns, 2 diagonals) after every move. A draw is declared when all 9 cells are filled with no winner. The result is broadcast to both clients as a `GAME_OVER` message.

#### Matchmaking — quick match
Uses Nakama's built-in matchmaker. Each client submits a ticket via `socket.addMatchmaker`. When two compatible tickets exist, Nakama calls the server-side `matchmakerMatched` hook, which creates an authoritative match and returns the `match_id`. Both clients receive the ID and join automatically.

#### Matchmaking — private room
A player calls the `create_match` RPC to create a named match and receives a `match_id`. They share this ID out-of-band. The second player pastes it into the Join field. Both players end up in the same authoritative match.

#### Disconnect handling
`matchLeave` is called by Nakama whenever a player's WebSocket closes during a game. The server immediately declares the remaining player the winner by forfeit, records the outcome, and broadcasts `GAME_OVER`.

#### Optimistic UI
Clicking a cell renders a pending (dimmed) symbol immediately without waiting for the server round-trip, making the game feel instant. The pending state is cleared as soon as the authoritative `GAME_STATE` arrives. If the server rejects the move (`ERROR`), the pending state is cleared and the board returns to its last known good state.

---

### Bonus features (implemented)

#### Timed game mode (30-second turns)
Selectable from the lobby alongside Classic mode. On the server, `turnDeadlineMs` stores the absolute epoch millisecond at which the current turn expires. Every `matchLoop` tick (2 Hz) checks `Date.now() >= turnDeadlineMs`; on expiry the active player forfeits. The client displays a live countdown that changes colour (green → orange → red) but has no authority over the game outcome.

#### Leaderboard
A persistent `tictactoe_wins` leaderboard backed by Nakama's built-in leaderboard API (descending sort, `SET` operator). After every game conclusion the server writes the player's total win count. The top 10 are exposed via the `get_leaderboard` RPC and displayed in a dedicated Leaderboard screen.

#### Player statistics
Each player has a stats record in Nakama key-value storage (`player_stats / game_stats`). It tracks wins, losses, draws, current win streak, and best ever win streak. Stats are updated on every game end — including timeouts and forfeits — and are displayed below the leaderboard table in the UI. Storage permissions are set to public-read / server-only-write so stats cannot be tampered with from the client.

#### Concurrent games
Nakama's authoritative match system natively supports running many matches in parallel — each match is an isolated stateful object on the server. There is no global shared state between matches. Multiple pairs of players can be in different games simultaneously without interference.

---

## 3. Goals and Constraints

| Goal | Decision |
|------|----------|
| Server-authoritative | No client can win by sending fabricated state |
| Uniform TypeScript codebase | Server plugin uses Nakama TypeScript runtime (not Go) |
| Real-time, low-latency | WebSocket, not polling |
| Scalable matchmaking | Nakama built-in matchmaker, not custom queue |
| Persistent stats | Nakama storage + leaderboard APIs |
| Zero external dependencies | No custom database schema; everything in Nakama's built-ins |

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                        │
│                                                                 │
│  React 18 + Vite + TypeScript                                   │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌─────────────┐  │
│  │ Login    │  │  Lobby   │  │   Game     │  │ Leaderboard │  │
│  │ Screen   │  │  Screen  │  │   Screen   │  │   Screen    │  │
│  └──────────┘  └──────────┘  └────────────┘  └─────────────┘  │
│        │             │              │                │          │
│        └─────────────┴──────────────┴────────────────┘          │
│                          useMatch / useNakama hooks              │
│                          Nakama JS SDK v2.8 (WebSocket)          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ ws://host:7350
┌──────────────────────────────▼──────────────────────────────────┐
│  Nakama Server (heroiclabs/nakama:3.38)                         │
│                                                                 │
│  TypeScript Runtime (goja/ES5)                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ InitModule                                               │   │
│  │  • registerMatch('tictactoe', matchHandlers)             │   │
│  │  • registerMatchmakerMatched(matchmakerMatched)          │   │
│  │  • registerRpc(create_match, find_match, ...)            │   │
│  │  • leaderboardCreate('tictactoe_wins')                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ TicTacToe Match Handler (authoritative)                  │   │
│  │  board.ts  — pure game logic (no side effects)           │   │
│  │  match.ts  — lifecycle, timer, stats, RPCs               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  PostgreSQL 14                                                  │
│  • Sessions & accounts       (Nakama built-in)                  │
│  • player_stats / game_stats (Nakama key-value storage)         │
│  • tictactoe_wins            (Nakama leaderboard)               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Match Lifecycle

```
matchInit          — allocate board, set phase = 'waiting'
     │
matchJoinAttempt   — reject if full (≥2) or finished
     │
matchJoin          — assign X / O; when both seats filled:
     │                phase = 'playing', broadcast GAME_STATE
     │
matchLoop (2 Hz)   — process MOVE messages, run timer check
     │                on valid move: update board, check outcome
     │                  win/draw/timeout → GAME_OVER, return null
     │                  otherwise       → GAME_STATE, continue
matchLeave         — forfeit win to remaining player
matchTerminate     — no-op cleanup
```

### State machine

```
waiting ──(2 players joined)──► playing ──(win/draw/timeout/forfeit)──► finished
```

---

## 5. Message Protocol

All messages are binary-encoded JSON over Nakama's real-time WebSocket.

### Op codes

| Code | Name       | Direction       | Trigger |
|------|------------|-----------------|---------|
| 1    | MOVE       | Client → Server | Player clicks a cell |
| 2    | GAME_STATE | Server → Both   | After each valid move, or game start |
| 3    | GAME_OVER  | Server → Both   | Win, draw, timeout, or disconnect |
| 4    | ERROR      | Server → Sender | Invalid move or out-of-turn attempt |

### GAME_STATE / GAME_OVER payload

```json
{
  "board":            ["X","","","","O","","","",""],
  "current_turn":     "<user_id>",
  "symbols":          { "<uid_x>": "X", "<uid_o>": "O" },
  "phase":            "playing",
  "winner":           "",
  "move_count":       2,
  "timed_mode":       true,
  "turn_deadline_ms": 1711234567890
}
```

---

## 6. Game Modes

### Classic
Standard rules. No time limit. Match continues until win or draw.

### Timed (bonus feature)
Each player has **30 seconds** per turn. The deadline is stored as an absolute epoch timestamp (`turnDeadlineMs`) in the server's match state.

On every `matchLoop` tick (2 Hz), the server checks `Date.now() >= turnDeadlineMs`. If the deadline is exceeded, the active player forfeits and the opponent wins. The client displays a live countdown using a `setInterval` — purely cosmetic; the server is the authority.

---

## 7. Matchmaking

Two paths to enter a game:

### Quick match (matchmaker)
1. Client calls `socket.addMatchmaker('*', 2, 2, { mode })`.
2. Nakama's built-in matchmaker collects tickets; when two compatible tickets exist, it calls the server-side `matchmakerMatched` hook.
3. The hook calls `nk.matchCreate('tictactoe', { mode })` and returns the match ID.
4. Nakama delivers a `MatchmakerMatched` message to both clients with `match_id` set.
5. Each client calls `socket.joinMatch(match_id)`.

### Private room
1. Host calls the `create_match` RPC → receives a `match_id`.
2. Host shares the ID out-of-band.
3. Guest pastes the ID and calls `socket.joinMatch(match_id)`.

---

## 8. Leaderboard & Stats

### Per-player stats (Nakama storage)
Stored at `player_stats / game_stats / <user_id>` (public read, server-only write):

```json
{ "wins": 5, "losses": 3, "draws": 1, "currentStreak": 2, "bestStreak": 4, "gamesPlayed": 9 }
```

Updated after every game end (win, loss, draw, timeout, disconnect forfeit).

### Leaderboard (Nakama built-in)
`tictactoe_wins` — descending sort, `SET` operator (overwrite with latest win total). Written after every game by `nk.leaderboardRecordWrite`. The top 10 are fetched via the `get_leaderboard` RPC.

---

## 9. Frontend Architecture

### Screen routing (App.tsx)
State-machine routing — no router library needed:

```
login → lobby → (searching) → (waiting) → playing → game-over
                    │
                    └──► leaderboard
```

### Key hooks

| Hook | Responsibility |
|------|----------------|
| `useNakama` | Nakama client init, device-auth, socket connect |
| `useMatch` | Match lifecycle, WebSocket events, optimistic moves, mode selection |
| `useLeaderboard` | Fetch leaderboard + personal stats via RPC |

### Optimistic moves
When a player clicks a cell, the client immediately marks it as "pending" (rendered as a dimmed symbol) and sends the MOVE message. On the next server broadcast the pending state is cleared and replaced by the authoritative board. If the server returns an ERROR the pending move is also cleared.

### Timer display
`useCountdown` runs a `setInterval` at 250ms resolution, deriving seconds remaining from `turnDeadlineMs - Date.now()`. Colour transitions: green → orange (≤10s) → red (≤5s). The interval is torn down when the game ends or the deadline changes.

---

## 10. Security Model

| Threat | Mitigation |
|--------|------------|
| Client sends move out of turn | Server checks `msg.sender.userId === ms.currentTurn` |
| Client sends move to occupied cell | `applyMove` throws; server sends ERROR |
| Client sends move after game ends | Server checks `ms.phase === 'playing'` |
| Client manipulates board state | Board lives only in server match state; client never sends board |
| Client skips timer | Deadline enforced in `matchLoop`; client countdown is cosmetic only |
| Stats tampering | Storage permission `write: 0` (server-only) |

---

## 11. Build & Deployment

### Server plugin compilation
The TypeScript plugin is compiled with `tsc --outFile build/index.js` (ES5 target, no module system). All three source files (`board.ts`, `match.ts`, `main.ts`) are concatenated into a single bundle that Nakama's embedded goja JavaScript engine loads directly — no webpack, no bundler.

### Docker image
Multi-stage build:
1. `node:22-alpine` — installs dependencies and runs `tsc`
2. `heroiclabs/nakama:3.38.0` — copies `build/index.js` into `/nakama/data/modules/`

The final image contains no Node.js runtime; only the compiled JS and the Nakama binary.

### Frontend
Vite produces a static `dist/` folder. Deployable to any CDN or static host. Runtime configuration via `VITE_NAKAMA_HOST`, `VITE_NAKAMA_PORT`, `VITE_NAKAMA_KEY`, `VITE_USE_SSL` environment variables injected at build time.

---

## 12. Trade-offs and Alternatives Considered

| Decision | Alternative | Reason chosen |
|----------|-------------|---------------|
| TypeScript runtime | Go plugin | Uniform codebase; easier to present in interview; official Heroic Labs support |
| Nakama matchmaker | Custom lobby RPC | Battle-tested, handles edge cases (disconnect during search), free |
| Nakama storage for stats | External DB | Zero extra infrastructure; fits within assignment scope |
| `SET` leaderboard operator | `INCR` | Safer — re-running `recordGameResult` doesn't double-count wins |
| `sessionStorage` for device ID | `localStorage` | Allows two tabs in the same browser to be different users (testing) |
| No React Router | React Router | Single-page with 4 screens doesn't warrant the dependency |
| Tick rate 2 Hz | Higher | 500ms timer resolution is sufficient; lower CPU overhead |
