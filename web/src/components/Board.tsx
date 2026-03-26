import { Cell } from './Cell';
import { Symbol as GameSymbol } from '../protocol/types';

interface Props {
  board: GameSymbol[];
  pendingCell: number | null;
  isMyTurn: boolean;
  phase: string;
  onCellClick: (cell: number) => void;
}

export function Board({ board, pendingCell, isMyTurn, phase, onCellClick }: Props) {
  return (
    <div
      role="grid"
      aria-label="Tic-Tac-Toe board"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        width: '100%',
        maxWidth: '320px',
        margin: '0 auto',
      }}
    >
      {board.map((val, i) => (
        <Cell
          key={i}
          value={val}
          pending={pendingCell === i}
          disabled={
            !isMyTurn          ||
            phase !== 'playing' ||
            val !== ''         ||
            pendingCell !== null
          }
          onClick={() => onCellClick(i)}
        />
      ))}
    </div>
  );
}
