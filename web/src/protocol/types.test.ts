import { describe, it, expect } from 'vitest';
import { OpCode } from './types';

describe('OpCode', () => {
  it('has the expected numeric values matching the Go server constants', () => {
    expect(OpCode.MOVE).toBe(1);
    expect(OpCode.GAME_STATE).toBe(2);
    expect(OpCode.GAME_OVER).toBe(3);
    expect(OpCode.ERROR).toBe(4);
    expect(OpCode.PLAYER_READY).toBe(5);
    expect(OpCode.OPPONENT_LEFT).toBe(6);
  });

  it('all values are unique', () => {
    const values = Object.values(OpCode);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('all values are positive integers', () => {
    for (const v of Object.values(OpCode)) {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThan(0);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});
