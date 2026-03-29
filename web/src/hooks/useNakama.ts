import { useState, useEffect, useRef, useCallback } from 'react';
import { Client, Session, Socket } from '@heroiclabs/nakama-js';

const NAKAMA_HOST = import.meta.env.VITE_NAKAMA_HOST || 'localhost';
const NAKAMA_PORT = import.meta.env.VITE_NAKAMA_PORT || '7350';
const NAKAMA_KEY  = import.meta.env.VITE_NAKAMA_KEY  || 'defaultkey';
const USE_SSL     = import.meta.env.VITE_USE_SSL === 'true';

export interface NakamaState {
  client: Client | null;
  session: Session | null;
  socket: Socket | null;
  userId: string | null;
  isConnecting: boolean;
  error: string | null;
  login: (username: string) => Promise<void>;
}

function cleanNakamaMessage(raw: string): string {
  const rpc = raw.match(/^Error:\s*(.+?)\s+at\s+\w+/);
  if (rpc) return rpc[1];
  const json = raw.match(/"message"\s*:\s*"([^"]+)"/);
  if (json) return cleanNakamaMessage(json[1]);
  return raw;
}

async function extractError(err: unknown): Promise<string> {
  if (typeof err === 'object' && err !== null && typeof (err as any).json === 'function') {
    try {
      const body = await (err as Response).json();
      if (body.message) return cleanNakamaMessage(body.message);
      if (body.error) return body.error;
    } catch { /* fall through */ }
  }
  if (err instanceof Error) return cleanNakamaMessage(err.message);
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    if (typeof e.message === 'string') return cleanNakamaMessage(e.message);
    try { return JSON.stringify(err); } catch { /* ignore */ }
  }
  if (typeof err === 'string') return err;
  return 'Connection failed';
}

export function useNakama(): NakamaState {
  const [session, setSession]         = useState<Session | null>(null);
  const [socket, setSocket]           = useState<Socket | null>(null);
  const [isConnecting, setConnecting] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const clientRef                     = useRef<Client | null>(null);

  useEffect(() => {
    clientRef.current = new Client(NAKAMA_KEY, NAKAMA_HOST, NAKAMA_PORT, USE_SSL);
  }, []);

  const login = useCallback(async (username: string) => {
    if (!clientRef.current) return;
    setConnecting(true);
    setError(null);
    try {
      // DEV ONLY: Predictable device ID kept simple for development. In production,
      // use a cryptographically random UUID persisted in localStorage per user,
      // or switch to authenticateEmail / authenticateCustom with proper credentials.
      const deviceId = `nakama_user_${username}`;
      const sess = await clientRef.current.authenticateDevice(deviceId, true, username);

      const sock = clientRef.current.createSocket(USE_SSL, false);
      await sock.connect(sess, true);

      setSession(sess);
      setSocket(sock);
    } catch (err: unknown) {
      setSession(null);
      setSocket(null);
      setError(await extractError(err));
    } finally {
      setConnecting(false);
    }
  }, []);

  return {
    client: clientRef.current,
    session,
    socket,
    userId: session?.user_id ?? null,
    isConnecting,
    error,
    login,
  };
}
