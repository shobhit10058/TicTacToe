import { useState } from 'react';

interface Props {
  onLogin: (username: string) => void;
  isConnecting: boolean;
  error: string | null;
}

export function LoginScreen({ onLogin, isConnecting, error }: Props) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onLogin(trimmed);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Tic-Tac-Toe</h1>
        <p style={styles.subtitle}>Real-time multiplayer</p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.input}
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoFocus
            autoComplete="off"
          />
          <button
            style={{
              ...styles.button,
              opacity: isConnecting || !name.trim() ? 0.6 : 1,
              cursor: isConnecting || !name.trim() ? 'not-allowed' : 'pointer',
            }}
            type="submit"
            disabled={isConnecting || !name.trim()}
          >
            {isConnecting ? 'Connecting…' : 'Play'}
          </button>
        </form>
        {error && <p style={styles.error}>{error}</p>}
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
    textAlign: 'center',
    border: '1px solid #2a2a3a',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 700,
    marginBottom: '0.25rem',
    color: '#00e5c0',
  },
  subtitle: {
    color: '#888',
    marginBottom: '2rem',
    fontSize: '0.9rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  input: {
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    border: '1px solid #2a2a3a',
    background: '#0a0a0f',
    color: '#e0e0e0',
    fontSize: '1rem',
    outline: 'none',
  },
  button: {
    padding: '0.75rem',
    borderRadius: '8px',
    border: 'none',
    background: '#00e5c0',
    color: '#0a0a0f',
    fontSize: '1rem',
    fontWeight: 600,
    minHeight: '48px',
    transition: 'opacity 0.2s',
  },
  error: {
    color: '#ff6b6b',
    marginTop: '1rem',
    fontSize: '0.85rem',
  },
};
