import { MatchState } from '../hooks/useMatch';

interface Props {
  match: MatchState;
  onPlayAgain: () => void;
}

export function GameOver({ match, onPlayAgain }: Props) {
  const isDraw    = match.winner === 'draw';
  const isWinner  = !isDraw && match.winner === match.myUserId;

  const title      = isDraw ? 'Draw!' : isWinner ? 'You win!' : 'You lose';
  const titleColor = isDraw ? '#f0c040' : isWinner ? '#00e5c0' : '#ff6b9d';

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <p style={{ ...styles.title, color: titleColor }}>{title}</p>
        {isWinner && <p style={styles.sub}>Well played!</p>}
        {!isWinner && !isDraw && <p style={styles.sub}>Better luck next time.</p>}

        {/* Mini board recap */}
        <div style={styles.boardSummary} aria-label="final board">
          {match.board.map((cell, i) => (
            <div
              key={i}
              style={{
                ...styles.cell,
                color:
                  cell === 'X' ? '#00e5c0' :
                  cell === 'O' ? '#ff6b9d' :
                  '#2a2a3a',
              }}
            >
              {cell || '·'}
            </div>
          ))}
        </div>

        <button style={styles.btn} onClick={onPlayAgain}>
          Play again
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100dvh',
    padding: '1rem',
  },
  card: {
    background: '#13131a',
    borderRadius: '16px',
    padding: '2rem',
    width: '100%',
    maxWidth: '360px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    alignItems: 'center',
    border: '1px solid #2a2a3a',
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 700,
    textAlign: 'center',
  },
  sub: {
    color: '#888',
    marginTop: '-1rem',
    fontSize: '0.9rem',
    textAlign: 'center',
  },
  boardSummary: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '6px',
    width: '180px',
  },
  cell: {
    aspectRatio: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a0f',
    borderRadius: '8px',
    fontSize: '1.5rem',
    fontWeight: 700,
  },
  btn: {
    padding: '0.75rem 2rem',
    borderRadius: '8px',
    border: 'none',
    background: '#00e5c0',
    color: '#0a0a0f',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: '48px',
    width: '100%',
  },
};
