import { useState } from 'react';

interface Props {
  onFindMatch: () => void;
  onCreateMatch: () => void;
  onJoinMatch: (id: string) => void;
  phase: string;
  matchId: string | null;
}

export function LobbyScreen({ onFindMatch, onCreateMatch, onJoinMatch, phase, matchId }: Props) {
  const [joinId, setJoinId] = useState('');

  const isSearching = phase === 'searching' || phase === 'waiting';

  if (isSearching) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.spinner} />
          <p style={styles.status}>
            {phase === 'searching' ? 'Finding a match…' : 'Waiting for opponent…'}
          </p>
          {matchId && (
            <div style={styles.roomCode}>
              <p style={styles.roomLabel}>Room code (share with a friend)</p>
              <p style={styles.roomId}>{matchId}</p>
              <button
                style={styles.copyBtn}
                onClick={() => navigator.clipboard.writeText(matchId)}
              >
                Copy to clipboard
              </button>
            </div>
          )}
          <p style={styles.hint}>Quick match usually takes under 20 seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Find a Game</h2>

        <button style={styles.primaryBtn} onClick={onFindMatch}>
          Quick match
        </button>

        <div style={styles.divider}>
          <span>or</span>
        </div>

        <button style={styles.secondaryBtn} onClick={onCreateMatch}>
          Create private room
        </button>

        <div style={styles.joinRow}>
          <input
            style={styles.input}
            placeholder="Paste room ID to join"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
          />
          <button
            style={{
              ...styles.joinBtn,
              opacity: joinId.trim() ? 1 : 0.5,
              cursor: joinId.trim() ? 'pointer' : 'not-allowed',
            }}
            onClick={() => joinId.trim() && onJoinMatch(joinId.trim())}
            disabled={!joinId.trim()}
          >
            Join
          </button>
        </div>
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
    gap: '1rem',
    border: '1px solid #2a2a3a',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    textAlign: 'center',
    color: '#e0e0e0',
    marginBottom: '0.5rem',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #2a2a3a',
    borderTop: '4px solid #00e5c0',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 1rem',
  },
  status: {
    textAlign: 'center',
    fontSize: '1.1rem',
    color: '#e0e0e0',
  },
  hint: {
    textAlign: 'center',
    color: '#888',
    fontSize: '0.85rem',
  },
  roomCode: {
    background: '#0a0a0f',
    borderRadius: '8px',
    padding: '0.75rem',
    textAlign: 'center',
  },
  roomLabel: {
    color: '#888',
    fontSize: '0.75rem',
    marginBottom: '0.25rem',
  },
  roomId: {
    color: '#00e5c0',
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    wordBreak: 'break-all',
    marginBottom: '0.5rem',
  },
  copyBtn: {
    background: 'transparent',
    border: '1px solid #2a2a3a',
    color: '#888',
    borderRadius: '6px',
    padding: '0.25rem 0.75rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  primaryBtn: {
    padding: '0.85rem',
    borderRadius: '8px',
    border: 'none',
    background: '#00e5c0',
    color: '#0a0a0f',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: '48px',
  },
  secondaryBtn: {
    padding: '0.85rem',
    borderRadius: '8px',
    border: '1px solid #00e5c0',
    background: 'transparent',
    color: '#00e5c0',
    fontSize: '1rem',
    cursor: 'pointer',
    minHeight: '48px',
  },
  divider: {
    textAlign: 'center',
    color: '#555',
    fontSize: '0.85rem',
  },
  joinRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  input: {
    flex: 1,
    padding: '0.75rem',
    borderRadius: '8px',
    border: '1px solid #2a2a3a',
    background: '#0a0a0f',
    color: '#e0e0e0',
    fontSize: '0.9rem',
    outline: 'none',
    minWidth: 0,
  },
  joinBtn: {
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: 'none',
    background: '#2a2a3a',
    color: '#e0e0e0',
    fontWeight: 600,
    minHeight: '48px',
    transition: 'opacity 0.2s',
  },
};
