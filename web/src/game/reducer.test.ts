import { describe, it, expect } from 'vitest';
import { applyServerState, GameState } from './reducer';
import { GameStatePayload } from '../protocol/types';

const MY_USER = 'user-1';
const OPP_USER = 'user-2';

const emptyState: GameState = {
  board: Array(9).fill(''),
  currentTurn: '',
  mySymbol: '',
  opponentSymbol: '',
  phase: 'waiting',
  winner: '',
  pendingCell: null,
  timedMode: false,
  turnDeadlineMs: 0,
};

describe('applyServerState', () => {
  it('assigns mySymbol as X and opponentSymbol as O', () => {
    const gs: GameStatePayload = {
      board: ['X', '', '', '', '', '', '', '', ''],
      current_turn: OPP_USER,
      symbols: { [MY_USER]: 'X', [OPP_USER]: 'O' },
      phase: 'playing',
      winner: '',
      move_count: 1,
    };
    const next = applyServerState(emptyState, gs, MY_USER);
    expect(next.mySymbol).toBe('X');
    expect(next.opponentSymbol).toBe('O');
    expect(next.phase).toBe('playing');
    expect(next.board[0]).toBe('X');
    expect(next.currentTurn).toBe(OPP_USER);
  });

  it('clears pendingCell when server state arrives', () => {
    const prev: GameState = { ...emptyState, pendingCell: 4 };
    const gs: GameStatePayload = {
      board: ['', '', '', '', 'X', '', '', '', ''],
      current_turn: OPP_USER,
      symbols: { [MY_USER]: 'X', [OPP_USER]: 'O' },
      phase: 'playing',
      winner: '',
      move_count: 1,
    };
    const next = applyServerState(prev, gs, MY_USER);
    expect(next.pendingCell).toBeNull();
    expect(next.board[4]).toBe('X');
  });

  it('sets phase to finished with winner on game over', () => {
    const gs: GameStatePayload = {
      board: ['X', 'X', 'X', '', '', '', '', '', ''],
      current_turn: MY_USER,
      symbols: { [MY_USER]: 'X', [OPP_USER]: 'O' },
      phase: 'finished',
      winner: MY_USER,
      move_count: 3,
    };
    const next = applyServerState(emptyState, gs, MY_USER);
    expect(next.phase).toBe('finished');
    expect(next.winner).toBe(MY_USER);
  });

  it('handles draw correctly', () => {
    const gs: GameStatePayload = {
      board: ['X', 'O', 'X', 'O', 'X', 'X', 'O', 'X', 'O'],
      current_turn: '',
      symbols: { [MY_USER]: 'X', [OPP_USER]: 'O' },
      phase: 'finished',
      winner: 'draw',
      move_count: 9,
    };
    const next = applyServerState(emptyState, gs, MY_USER);
    expect(next.phase).toBe('finished');
    expect(next.winner).toBe('draw');
  });

  it('keeps waiting phase when only one player has joined', () => {
    const gs: GameStatePayload = {
      board: ['', '', '', '', '', '', '', '', ''],
      current_turn: '',
      symbols: { [MY_USER]: 'X' },
      phase: 'waiting',
      winner: '',
      move_count: 0,
    };
    const next = applyServerState(emptyState, gs, MY_USER);
    expect(next.phase).toBe('waiting');
    expect(next.mySymbol).toBe('X');
    expect(next.opponentSymbol).toBe(''); // no opponent yet
  });

  it('preserves other fields not managed by server state', () => {
    const prev: GameState = { ...emptyState, pendingCell: 7 };
    const gs: GameStatePayload = {
      board: ['', '', '', '', '', '', '', '', ''],
      current_turn: MY_USER,
      symbols: { [MY_USER]: 'O', [OPP_USER]: 'X' },
      phase: 'playing',
      winner: '',
      move_count: 0,
    };
    const next = applyServerState(prev, gs, MY_USER);
    expect(next.mySymbol).toBe('O');
    expect(next.opponentSymbol).toBe('X');
    expect(next.pendingCell).toBeNull();
  });
});
