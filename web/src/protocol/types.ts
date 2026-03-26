/**
 * Shared protocol types mirroring the Go server op codes and message shapes.
 * Keep these in sync with server/match_tictactoe.go.
 */

export const OpCode = {
  MOVE: 1,
  GAME_STATE: 2,
  GAME_OVER: 3,
  ERROR: 4,
  PLAYER_READY: 5,
  OPPONENT_LEFT: 6,
} as const;

export type OpCodeValue = (typeof OpCode)[keyof typeof OpCode];

export type Symbol = 'X' | 'O' | '';
export type Phase = 'waiting' | 'playing' | 'finished';

/** Sent by the client to make a move. OpCode.MOVE */
export interface MovePayload {
  cell: number; // 0-8, row-major order
}

/** Broadcast by the server after each move and when the game starts. OpCode.GAME_STATE or GAME_OVER */
export interface GameStatePayload {
  board: [Symbol, Symbol, Symbol, Symbol, Symbol, Symbol, Symbol, Symbol, Symbol];
  current_turn: string; // user_id of the player whose turn it is
  symbols: Record<string, Symbol>;  // user_id -> "X" | "O"
  phase: Phase;
  winner: string; // user_id | "draw" | ""
  move_count: number;
  timed_mode?: boolean;
  turn_deadline_ms?: number; // epoch ms; 0 in classic mode or after game over
}

/** Sent to the requesting client only on an invalid action. OpCode.ERROR */
export interface ErrorPayload {
  message: string;
}

// ---------------------------------------------------------------------------
// Leaderboard / stats (RPC responses)
// ---------------------------------------------------------------------------

export interface PlayerStats {
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  gamesPlayed: number;
}

export interface LeaderboardRow {
  rank: number;
  username: string;
  wins: number;
}

export interface LeaderboardResponse {
  records: LeaderboardRow[];
}
