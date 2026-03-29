# Design Document — Multiplayer Tic-Tac-Toe

## 1. What I built and why

This is a real-time multiplayer Tic-Tac-Toe game where two players connect over WebSocket and play against each other. The entire game logic runs on the server — the frontend is just a thin layer that sends clicks and renders what the server tells it. I chose this architecture because the assignment specifically asked for a server-authoritative design, and honestly it's the only sane way to build a multiplayer game where you don't want people cheating.

The stack is TypeScript everywhere: Nakama's TypeScript runtime for the server plugin, React + Vite for the frontend. I went with TypeScript over Go for the Nakama plugin because it keeps the codebase uniform and is the officially supported approach from Heroic Labs.

Below is a walkthrough of every feature, how I implemented it, and why.

---

## 2. Features implemented

### Server-authoritative game logic

This was the core requirement. Every move goes through the server's `matchLoop` where it gets validated — is the game still going? Is it actually this player's turn? Is the cell empty? Is the cell index even valid (0–8)? Only after all checks pass does the board update. The client sends just a cell number, nothing else. It doesn't get to pick X or O — the server assigned that when the player joined. So even if someone tampers with the client code, they can't send a move as the other player's symbol or put a piece on an occupied square.

### Real-time WebSocket gameplay

Players talk to Nakama over a persistent WebSocket connection. All game events — board updates, game over, errors — are pushed from the server instantly. There's no polling involved. I used the Nakama JS SDK (v2.8) which handles the socket lifecycle and reconnection under the hood.

### Matchmaking

I implemented two ways to start a game:

**Quick match** — the player hits "Quick match" and I submit a matchmaker ticket through Nakama's built-in matchmaker. When two tickets with the same mode exist, Nakama fires the `matchmakerMatched` hook on the server, which creates an authoritative match. Both clients get notified and auto-join. I scoped the matchmaker query by mode (`+properties.mode:timed`) so a Classic player never gets paired with a Timed player.

**Private rooms** — one player creates a room via the `create_match` RPC, gets a match ID, and shares it. The other player pastes that ID and joins directly. I also added a guard so a player can't accidentally match against themselves by joining their own room.

### Disconnect handling

If a player's socket drops mid-game, Nakama calls `matchLeave`. I immediately declare the remaining player the winner by forfeit, record the stats for both, and broadcast the game over. No dangling matches.

### Authentication & sessions

> **⚠ Demo-only authentication.** The device ID is derived from the username (`nakama_user_<name>`), meaning anyone who knows a username can log in as that account — there is no password, OAuth, or any other authentication barrier. This approach exists solely to simplify testing (same name → same account, different names → different accounts for multi-tab play). **Do not use this scheme in production.** A real deployment must use password-based, OAuth, or another verified credential flow.

I wanted entering the same username to always log you back into the same account (not fail with "username already taken"). So the device ID is derived from the username — `nakama_user_<name>` — which means the same name always maps to the same Nakama account.

Single-session enforcement is handled atomically inside a `beforeAuthenticateDevice` hook on the server. When a player authenticates, the hook checks whether the username already has an active WebSocket connection; if so, the authentication itself is rejected before a session token is ever issued. This eliminates the TOCTOU (time-of-check-to-time-of-use) race that would exist with a separate post-auth RPC — there is no window between "check" and "connect" where a second client could slip through. A legacy `check_online` RPC is still registered for informational use but is no longer part of the login-critical path.

### Responsive UI for mobile

The UI is built with flexbox layouts and `maxWidth` card constraints so it works on any screen size out of the box. On top of that I added `touch-action: manipulation` to eliminate the 300ms tap delay, safe-area padding for notched phones, and a media query for small screens like iPhone SE. All tap targets are at least 48px. Cell font sizes use `clamp()` to scale between mobile and desktop.

### Optimistic UI

When you click a cell, the client shows a dimmed pending symbol immediately — before the server even responds. Once the server broadcasts the authoritative state, the pending mark gets replaced with the real one. If the server rejects the move, the pending mark just disappears. This makes the game feel instant even with some network latency.

---

### Timed game mode (30s per turn)

Players pick Classic or Timed from the lobby. In timed mode, the server stores a `turnDeadlineMs` (absolute epoch timestamp) and checks it every `matchLoop` tick at 2 Hz. If the clock runs out, the active player forfeits automatically. The client shows a countdown that goes green → orange → red, but it's purely cosmetic — the server is the only authority on whether time ran out.

Because the server checks the deadline on a 2 Hz tick (every 500ms), timeout detection can be up to ~500ms late — a player may exceed the 30s limit by up to half a second before forfeiture triggers. This is acceptable for casual play but would need a higher tick rate for use cases requiring precise timing.

### Leaderboard

I created a `tictactoe_wins` leaderboard using Nakama's built-in leaderboard API. After every game ends, the server writes the player's total win count with the `SET` operator (so re-running the write is idempotent — no double-counting). The top 10 are fetched via an RPC and shown in a dedicated Leaderboard screen.

### Player statistics

Each player has a stats record in Nakama's key-value storage tracking wins, losses, draws, current streak, and best streak. These get updated on every game end — wins, losses, timeouts, forfeits, all of it. The storage permissions are public-read but server-only-write, so clients can see stats but can't tamper with them. The stats show up below the leaderboard in the UI.

### Concurrent games

Nakama's authoritative match system handles this natively — each match is its own isolated state machine on the server. There's no shared global state between matches. Multiple games can run in parallel without stepping on each other.

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

## 4. System Architecture

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
│  │  • registerRpc(create_match, find_match, check_online, ..)│   │
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

## 5. Match Lifecycle

```
matchInit          — allocate board, set phase = 'waiting'
     │
matchJoinAttempt   — reject if full (≥2), finished, or same user already seated
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

## 6. Message Protocol

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

## 7. Game Modes

### Classic
Standard rules. No time limit. Match continues until win or draw.

### Timed
Each player has **30 seconds** per turn. The deadline is stored as an absolute epoch timestamp (`turnDeadlineMs`) in the server's match state.

On every `matchLoop` tick (2 Hz), the server checks `Date.now() >= turnDeadlineMs`. If the deadline is exceeded, the active player forfeits and the opponent wins. The client displays a live countdown using a `setInterval` — purely cosmetic; the server is the authority.

---

## 8. Matchmaking

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

## 9. Leaderboard & Stats

### Per-player stats (Nakama storage)
Stored at `player_stats / game_stats / <user_id>` (public read, server-only write):

```json
{ "wins": 5, "losses": 3, "draws": 1, "currentStreak": 2, "bestStreak": 4, "gamesPlayed": 9 }
```

Updated after every game end (win, loss, draw, timeout, disconnect forfeit).

### Leaderboard (Nakama built-in)
`tictactoe_wins` — descending sort, `SET` operator (overwrite with latest win total). Written after every game by `nk.leaderboardRecordWrite`. The top 10 are fetched via the `get_leaderboard` RPC.

---

## 10. Frontend Architecture

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
| `useNakama` | Nakama client init, username-derived device auth, single-session check, socket connect |
| `useMatch` | Match lifecycle, WebSocket events, optimistic moves, mode selection |
| `useLeaderboard` | Fetch leaderboard + personal stats via RPC |

### Optimistic moves
When a player clicks a cell, the client immediately marks it as "pending" (rendered as a dimmed symbol) and sends the MOVE message. On the next server broadcast the pending state is cleared and replaced by the authoritative board. If the server returns an ERROR the pending move is also cleared.

### Timer display
`useCountdown` runs a `setInterval` at 250ms resolution, deriving seconds remaining from `turnDeadlineMs - Date.now()`. Colour transitions: green → orange (≤10s) → red (≤5s). The interval is torn down when the game ends or the deadline changes.

---

## 11. Security Model

| Threat | Mitigation |
|--------|------------|
| Client sends move out of turn | Server checks `msg.sender.userId === ms.currentTurn` |
| Client sends move to occupied cell | `applyMove` throws; server sends ERROR |
| Client sends move after game ends | Server checks `ms.phase === 'playing'` |
| Client sends invalid cell index | `applyMove` validates cell is within 0–8 range |
| Client tries to choose X or O | Client only sends `{ cell }`; server looks up symbol from `ms.symbols[sender.userId]` |
| Client manipulates board state | Board lives only in server match state; client never sends board |
| Client skips timer | Deadline enforced in `matchLoop`; client countdown is cosmetic only |
| Duplicate active session | `beforeAuthenticateDevice` hook atomically rejects auth if `user.online` is true — no TOCTOU window |
| Username-derived device ID (no auth barrier) | **Demo-only.** Anyone who knows a username can impersonate the account. Production must use password/OAuth authentication |
| Self-matching via private room | `matchJoinAttempt` rejects if the player's userId is already seated |
| Stats tampering | Storage permission `write: 0` (server-only) |
| Server stack traces leaking | RPCs return `{ error: "..." }` JSON instead of throwing, preventing internals from reaching the client |

---

## 12. Build & Deployment

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

## 13. Trade-offs and Alternatives Considered

| Decision | Alternative | Reason chosen |
|----------|-------------|---------------|
| TypeScript runtime | Go plugin | Uniform codebase; easier to present in interview; official Heroic Labs support |
| Nakama matchmaker | Custom lobby RPC | Battle-tested, handles edge cases (disconnect during search), free |
| Nakama storage for stats | External DB | Zero extra infrastructure; fits within assignment scope |
| `SET` leaderboard operator | `INCR` | Safer — re-running `recordGameResult` doesn't double-count wins |
| Username-derived device ID | Random UUID per tab | Same username always maps to the same account (login semantics); different usernames still get separate accounts for multi-tab testing. **Demo-only — no authentication barrier exists; anyone who knows a username can impersonate that account. Production must use password-based or OAuth authentication.** |
| No React Router | React Router | Single-page with 4 screens doesn't warrant the dependency |
| Tick rate 2 Hz | Higher | 500ms timer resolution is sufficient; lower CPU overhead |
