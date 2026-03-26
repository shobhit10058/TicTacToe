import { memo } from 'react';
import { Symbol as GameSymbol } from '../protocol/types';

interface Props {
  value: GameSymbol;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}

/**
 * A single cell on the Tic-Tac-Toe board.
 * Wrapped in memo to avoid re-renders when other cells change.
 */
export const Cell = memo(function Cell({ value, pending, disabled, onClick }: Props) {
  const textColor =
    value === 'X' ? '#00e5c0' :
    value === 'O' ? '#ff6b9d' :
    pending       ? '#555'    :
    'transparent';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={value || 'empty cell'}
      style={{
        width: '100%',
        aspectRatio: '1',
        background: '#13131a',
        border: '2px solid #2a2a3a',
        borderRadius: '12px',
        fontSize: 'clamp(1.5rem, 8vw, 3rem)',
        fontWeight: 700,
        color: textColor,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'transform 0.08s, background 0.15s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '56px',
        userSelect: 'none',
      }}
    >
      {pending ? '·' : value}
    </button>
  );
});
