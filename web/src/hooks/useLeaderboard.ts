import { useState, useCallback } from 'react';
import { Client, Session } from '@heroiclabs/nakama-js';
import { LeaderboardResponse, PlayerStats } from '../protocol/types';

export interface LeaderboardState {
  records: LeaderboardResponse['records'];
  myStats: PlayerStats | null;
  loading: boolean;
  error: string | null;
}

export function useLeaderboard(client: Client | null, session: Session | null) {
  const [state, setState] = useState<LeaderboardState>({
    records: [],
    myStats: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!client || !session) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [lbResult, statsResult] = await Promise.all([
        client.rpc(session, 'get_leaderboard', {}),
        client.rpc(session, 'get_my_stats', {}),
      ]);
      const lb    = (lbResult.payload  ?? {}) as unknown as LeaderboardResponse;
      const stats = (statsResult.payload ?? {}) as unknown as PlayerStats;
      setState({ records: lb.records ?? [], myStats: stats, loading: false, error: null });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load leaderboard',
      }));
    }
  }, [client, session]);

  return { ...state, refresh };
}
