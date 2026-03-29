import { describe, it, expect } from 'vitest';
import { newBoard, applyMove, checkOutcome } from '@server/board';

// Tests run against server/src/board.ts directly (single source of truth).
// The vitest plugin in vitest.config.ts auto-appends exports at test time
// so the server source stays unchanged for Nakama's outFile build.

describe('newBoard', () => {
  it('returns a 9-cell empty board', () => {
    const b = newBoard();
    expect(b).toHaveLength(9);
    expect(b.every((c: string) => c === '')).toBe(true);
  });
});

describe('applyMove', () => {
  it('places X on an empty cell', () => {
    const b = applyMove(newBoard(), 0, 'X');
    expect(b[0]).toBe('X');
  });

  it('places O on an empty cell', () => {
    const b = applyMove(newBoard(), 4, 'O');
    expect(b[4]).toBe('O');
  });

  it('does not mutate the original board', () => {
    const original = newBoard();
    const next = applyMove(original, 0, 'X');
    expect(original[0]).toBe('');
    expect(next[0]).toBe('X');
  });

  it('rejects cell index below 0', () => {
    expect(() => applyMove(newBoard(), -1, 'X')).toThrow('Cell must be between 0 and 8');
  });

  it('rejects cell index above 8', () => {
    expect(() => applyMove(newBoard(), 9, 'X')).toThrow('Cell must be between 0 and 8');
  });

  it('rejects move on an occupied cell', () => {
    const b = applyMove(newBoard(), 0, 'X');
    expect(() => applyMove(b, 0, 'O')).toThrow('Cell is already occupied');
  });

  it('rejects empty string as symbol', () => {
    expect(() => applyMove(newBoard(), 0, '' as any)).toThrow('Symbol must be X or O');
  });
});

describe('checkOutcome', () => {
  it('returns empty string for an empty board', () => {
    expect(checkOutcome(newBoard())).toBe('');
  });

  it('returns empty string for a game in progress', () => {
    expect(checkOutcome(['X', 'O', '', '', 'X', '', '', '', ''])).toBe('');
  });

  it('detects X winning on top row', () => {
    expect(checkOutcome(['X', 'X', 'X', 'O', 'O', '', '', '', ''])).toBe('X');
  });

  it('detects O winning on middle row', () => {
    expect(checkOutcome(['X', '', 'X', 'O', 'O', 'O', '', '', ''])).toBe('O');
  });

  it('detects X winning on bottom row', () => {
    expect(checkOutcome(['', 'O', 'O', '', '', '', 'X', 'X', 'X'])).toBe('X');
  });

  it('detects X winning on left column', () => {
    expect(checkOutcome(['X', 'O', '', 'X', 'O', '', 'X', '', ''])).toBe('X');
  });

  it('detects O winning on middle column', () => {
    expect(checkOutcome(['X', 'O', '', '', 'O', 'X', '', 'O', ''])).toBe('O');
  });

  it('detects X winning on right column', () => {
    expect(checkOutcome(['', 'O', 'X', '', 'O', 'X', '', '', 'X'])).toBe('X');
  });

  it('detects X winning on main diagonal', () => {
    expect(checkOutcome(['X', 'O', '', '', 'X', 'O', '', '', 'X'])).toBe('X');
  });

  it('detects O winning on anti-diagonal', () => {
    expect(checkOutcome(['X', '', 'O', '', 'O', '', 'O', 'X', 'X'])).toBe('O');
  });

  it('detects a draw when board is full with no winner', () => {
    expect(checkOutcome(['X', 'O', 'X', 'O', 'X', 'O', 'O', 'X', 'O'])).toBe('draw');
  });

  it('does not report draw when board is full but has a winner', () => {
    expect(checkOutcome(['X', 'X', 'X', 'O', 'O', 'X', 'O', 'X', 'O'])).toBe('X');
  });
});
