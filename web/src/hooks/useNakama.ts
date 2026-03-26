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
      // Use sessionStorage so each browser tab gets its own Nakama identity.
      // This allows two tabs in the same browser to play against each other.
      let deviceId = sessionStorage.getItem('nakama_device_id');
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        sessionStorage.setItem('nakama_device_id', deviceId);
      }

      const sess = await clientRef.current.authenticateDevice(deviceId, true, username);
      setSession(sess);

      const sock = clientRef.current.createSocket(USE_SSL, false);
      await sock.connect(sess, true);
      setSocket(sock);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
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
