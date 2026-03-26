/**
 * Pure game-state reducer.
 * Extracted from useMatch so it can be unit-tested without a DOM or Nakama SDK.
 */
import { GameStatePayload, Symbol as GameSymbol } from '../protocol/types';

export interface GameState {
  board: GameSymbol[];
  currentTurn: string;
  mySymbol: GameSymbol;
  opponentSymbol: GameSymbol;
  phase: 'waiting' | 'playing' | 'finished';
  winner: string;
  pendingCell: number | null;
}

/**
 * applyServerState merges an authoritative GameStatePayload from the server
 * into the local GameState, resolving any optimistic updates.
 */
export function applyServerState(
  prev: GameState,
  gs: GameStatePayload,
  myUserId: string,
): GameState {
  const mySymbol = (gs.symbols[myUserId] ?? '') as GameSymbol;
  const oppEntry = Object.entries(gs.symbols).find(([id]) => id !== myUserId);
  const oppSymbol = (oppEntry?.[1] ?? '') as GameSymbol;

  const phase: GameState['phase'] =
    gs.phase === 'finished' ? 'finished' :
    gs.phase === 'playing'  ? 'playing'  :
    'waiting';

  return {
    ...prev,
    board: gs.board as GameSymbol[],
    currentTurn: gs.current_turn,
    mySymbol,
    opponentSymbol: oppSymbol,
    phase,
    winner: gs.winner,
    pendingCell: null, // authoritative state always clears optimistic moves
  };
}
