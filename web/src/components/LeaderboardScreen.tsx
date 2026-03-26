import { useEffect } from 'react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { Client, Session } from '@heroiclabs/nakama-js';

interface Props {
  client: Client | null;
  session: Session | null;
  onBack: () => void;
}

export function LeaderboardScreen({ client, session, onBack }: Props) {
  const { records, myStats, loading, error, refresh } = useLeaderboard(client, session);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <button style={styles.backBtn} onClick={onBack}>← Back</button>
        <h2 style={styles.title}>Leaderboard</h2>

        {loading && <p style={styles.hint}>Loading…</p>}
        {error   && <p style={styles.errorText}>{error}</p>}

        {!loading && !error && (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={{ ...styles.th, textAlign: 'left' }}>Player</th>
                <th style={styles.th}>Wins</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ ...styles.td, textAlign: 'center', color: '#555' }}>
                    No games played yet
                  </td>
                </tr>
              )}
              {records.map((row) => (
                <tr key={row.rank}>
                  <td style={{ ...styles.td, color: '#555' }}>{row.rank}</td>
                  <td style={{ ...styles.td }}>{row.username || '—'}</td>
                  <td style={{ ...styles.td, color: '#00e5c0', textAlign: 'center' }}>{row.wins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {myStats && (
          <div style={styles.myStats}>
            <p style={styles.myStatsTitle}>Your stats</p>
            <div style={styles.statsGrid}>
              <Stat label="Wins"    value={myStats.wins} />
              <Stat label="Losses"  value={myStats.losses} />
              <Stat label="Draws"   value={myStats.draws} />
              <Stat label="Streak"  value={myStats.currentStreak} />
              <Stat label="Best"    value={myStats.bestStreak} />
              <Stat label="Played"  value={myStats.gamesPlayed} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={statStyles.cell}>
      <span style={statStyles.value}>{value}</span>
      <span style={statStyles.label}>{label}</span>
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
    maxWidth: '420px',
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
    margin: 0,
  },
  backBtn: {
    alignSelf: 'flex-start',
    background: 'transparent',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: '0.9rem',
    padding: 0,
  },
  hint: { textAlign: 'center', color: '#555', fontSize: '0.9rem' },
  errorText: { textAlign: 'center', color: '#ff6b6b', fontSize: '0.9rem' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '0.5rem',
    borderBottom: '1px solid #2a2a3a',
    color: '#555',
    fontSize: '0.8rem',
    textAlign: 'center',
    fontWeight: 600,
  },
  td: {
    padding: '0.6rem 0.5rem',
    borderBottom: '1px solid #1a1a2a',
    color: '#e0e0e0',
    fontSize: '0.95rem',
  },
  myStats: {
    background: '#0a0a0f',
    borderRadius: '10px',
    padding: '1rem',
  },
  myStatsTitle: {
    color: '#555',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: '0.75rem',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.5rem',
  },
};

const statStyles: Record<string, React.CSSProperties> = {
  cell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },
  value: {
    fontSize: '1.4rem',
    fontWeight: 700,
    color: '#e0e0e0',
  },
  label: {
    fontSize: '0.7rem',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
};
