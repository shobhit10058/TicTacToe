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

function extractError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    const rpc = m.match(/^Error:\s*(.+?)\s*(?:at Error|$)/);
    if (rpc) return rpc[1];
    const json = m.match(/"message"\s*:\s*"([^"]+)"/);
    if (json) return json[1];
    return m;
  }
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    // Nakama SDK throws { code, message, error } where message contains
    // "Error: <msg> at Error (native)"
    if (typeof e.message === 'string') {
      const rpc = e.message.match(/^Error:\s*(.+?)\s*(?:at Error|$)/);
      if (rpc) return rpc[1];
      return e.message;
    }
    // Fallback: stringify the whole thing
    try { return JSON.stringify(err); } catch { /* ignore */ }
  }
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
      setError(extractError(err));
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
