import { Board } from './Board';
import { MatchState } from '../hooks/useMatch';

interface Props {
  match: MatchState;
  onMove: (cell: number) => void;
  onLeave: () => void;
}

export function GameScreen({ match, onMove, onLeave }: Props) {
  const isMyTurn = match.currentTurn === match.myUserId && match.phase === 'playing';

  const turnText =
    match.phase === 'waiting' ? 'Waiting for opponent…' :
    isMyTurn                  ? `Your turn (${match.mySymbol})` :
                                `Opponent's turn (${match.opponentSymbol})`;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.playerInfo}>
          <span style={{ color: '#00e5c0' }}>
            You&nbsp;({match.mySymbol || '?'})
          </span>
          <span style={{ color: '#555', fontSize: '0.8rem' }}>vs</span>
          <span style={{ color: '#ff6b9d' }}>
            Opp&nbsp;({match.opponentSymbol || '?'})
          </span>
        </div>

        <div
          style={{
            ...styles.turnBadge,
            background: isMyTurn ? '#00e5c020' : '#2a2a3a',
            color:      isMyTurn ? '#00e5c0'   : '#888',
          }}
        >
          {turnText}
        </div>
      </div>

      <Board
        board={match.board}
        pendingCell={match.pendingCell}
        isMyTurn={isMyTurn}
        phase={match.phase}
        onCellClick={onMove}
      />

      {match.error && <p style={styles.error}>{match.error}</p>}

      <button style={styles.leaveBtn} onClick={onLeave}>
        Leave game
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: '100dvh',
    padding: '1.5rem 1rem',
    gap: '1.5rem',
  },
  header: {
    width: '100%',
    maxWidth: '360px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    alignItems: 'center',
  },
  playerInfo: {
    display: 'flex',
    gap: '1rem',
    fontSize: '1rem',
    fontWeight: 600,
  },
  turnBadge: {
    padding: '0.4rem 1rem',
    borderRadius: '20px',
    fontSize: '0.9rem',
    transition: 'all 0.2s',
  },
  error: {
    color: '#ff6b6b',
    fontSize: '0.85rem',
    textAlign: 'center',
  },
  leaveBtn: {
    padding: '0.5rem 1.5rem',
    borderRadius: '8px',
    border: '1px solid #2a2a3a',
    background: 'transparent',
    color: '#888',
    cursor: 'pointer',
    fontSize: '0.9rem',
    marginTop: 'auto',
  },
};
