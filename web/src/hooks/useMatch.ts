import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket, Client, Session } from '@heroiclabs/nakama-js';
import { OpCode, MovePayload, ErrorPayload, Symbol as GameSymbol } from '../protocol/types';
import { applyServerState } from '../game/reducer';

export type MatchPhase = 'idle' | 'searching' | 'waiting' | 'playing' | 'finished';
export type MatchMode = 'quick' | 'private' | null;
export type GameMode = 'classic' | 'timed';

// MatchState is defined independently (not extending GameState) to avoid
// a TypeScript widening conflict on the `phase` field.
export interface MatchState {
  matchId: string | null;
  phase: MatchPhase;
  matchMode: MatchMode;
  gameMode: GameMode;
  board: GameSymbol[];
  currentTurn: string;
  mySymbol: GameSymbol;
  opponentSymbol: GameSymbol;
  winner: string;
  myUserId: string;
  myUsername: string;
  opponentUserId: string;
  opponentUsername: string;
  error: string | null;
  pendingCell: number | null;
  timedMode: boolean;
  turnDeadlineMs: number;
}

function initialMatchState(myUserId: string, myUsername: string): MatchState {
  return {
    matchId: null,
    phase: 'idle',
    matchMode: null,
    gameMode: 'classic',
    board: Array(9).fill('') as GameSymbol[],
    currentTurn: '',
    mySymbol: '',
    opponentSymbol: '',
    winner: '',
    myUserId,
    myUsername,
    opponentUserId: '',
    opponentUsername: '',
    error: null,
    pendingCell: null,
    timedMode: false,
    turnDeadlineMs: 0,
  };
}

export function useMatch(
  socket: Socket | null,
  client: Client | null,
  session: Session | null,
) {
  const myUserId   = session?.user_id ?? '';
  const myUsername = session?.username ?? '';
  const [state, setState] = useState<MatchState>(() => initialMatchState(myUserId, myUsername));
  const matchIdRef = useRef<string | null>(null);

  // Keep identity fields in sync — useState initializer only runs once (before login).
  useEffect(() => {
    if (myUserId) setState((prev) => ({ ...prev, myUserId, myUsername }));
  }, [myUserId, myUsername]);

  // Look up the opponent's username once we know their user ID.
  useEffect(() => {
    const oppId = state.opponentUserId;
    if (!oppId || !client || !session) return;
    client.getUsers(session, [oppId]).then((result) => {
      const name = result.users?.[0]?.username ?? oppId;
      setState((prev) => prev.opponentUserId === oppId ? { ...prev, opponentUsername: name } : prev);
    }).catch(() => {});
  }, [state.opponentUserId, client, session]);

  // Wire up socket listeners whenever the socket reference changes
  useEffect(() => {
    if (!socket) return;

    socket.onmatchdata = (matchData) => {
      const opCode  = matchData.op_code;
      const raw     = new TextDecoder().decode(matchData.data as Uint8Array);
      const payload = JSON.parse(raw);

      if (opCode === OpCode.GAME_STATE || opCode === OpCode.GAME_OVER) {
        setState((prev) => {
          const next = applyServerState(prev as any, payload, myUserId);
          const oppEntry = Object.keys(payload.symbols ?? {}).find((id) => id !== myUserId);
          return {
            ...prev,
            board:            next.board,
            currentTurn:      next.currentTurn,
            mySymbol:         next.mySymbol,
            opponentSymbol:   next.opponentSymbol,
            phase:            next.phase,
            winner:           next.winner,
            pendingCell:      next.pendingCell,
            timedMode:        next.timedMode ?? false,
            turnDeadlineMs:   next.turnDeadlineMs ?? 0,
            opponentUserId:   oppEntry ?? prev.opponentUserId,
            error:            null,
          };
        });
      } else if (opCode === OpCode.ERROR) {
        const err = payload as ErrorPayload;
        setState((prev) => ({ ...prev, pendingCell: null, error: err.message }));
      }
    };

    socket.onmatchpresence = (presence) => {
      if (presence.leaves && presence.leaves.length > 0) {
        setState((prev) => {
          if (prev.phase === 'playing') {
            return { ...prev, phase: 'finished', error: 'Opponent disconnected' };
          }
          return prev;
        });
      }
    };

    // Nakama matchmaker paired two tickets — join the authoritative match.
    // Server-side hook populates match_id; token is only set for relayed matches.
    socket.onmatchmakermatched = async (matched) => {
      try {
        const match = matched.match_id
          ? await socket.joinMatch(matched.match_id)
          : await socket.joinMatch(undefined, matched.token);
        matchIdRef.current = match.match_id;
        setState((prev) => ({
          ...prev,
          matchId: match.match_id,
          // GAME_STATE may have already arrived during the await and set phase to
          // 'playing'; only fall back to 'waiting' if we're still searching.
          phase: prev.phase === 'searching' ? 'waiting' : prev.phase,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          phase: 'idle',
          error: err instanceof Error ? err.message : 'Failed to join matched game',
        }));
      }
    };

    return () => {
      socket.onmatchdata          = undefined as any;
      socket.onmatchpresence      = undefined as any;
      socket.onmatchmakermatched  = undefined as any;
    };
  }, [socket, myUserId]);

  // Auto-match via Nakama's built-in matchmaker (race-free, preferred path)
  const findMatch = useCallback(async (mode: GameMode = 'classic') => {
    if (!socket) return;
    setState((prev) => ({ ...prev, phase: 'searching', matchMode: 'quick', gameMode: mode, error: null }));
    try {
      // Filter by mode so classic players only match classic, timed only timed.
      await socket.addMatchmaker(`+properties.mode:${mode}`, 2, 2, { mode }, {});
      // onmatchmakermatched above will fire when Nakama pairs a second ticket
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: 'idle',
        error: err instanceof Error ? err.message : 'Failed to search for match',
      }));
    }
  }, [socket]);

  // Create a named private match; copy the ID and share it with a friend
  const createMatch = useCallback(async (mode: GameMode = 'classic') => {
    if (!client || !session) return;
    setState((prev) => ({ ...prev, phase: 'searching', matchMode: 'private', gameMode: mode, error: null }));
    try {
      const result       = await client.rpc(session, 'create_match', { mode });
      const { match_id } = (result.payload ?? {}) as unknown as { match_id: string };
      if (!match_id) throw new Error('No match ID returned');
      await socket?.joinMatch(match_id);
      matchIdRef.current = match_id;
      setState((prev) => ({ ...prev, matchId: match_id, phase: 'waiting' }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: 'idle',
        error: err instanceof Error ? err.message : 'Failed to create match',
      }));
    }
  }, [client, session, socket]);

  // Join an existing match by ID (private room flow)
  const joinMatch = useCallback(async (matchId: string) => {
    if (!socket) return;
    setState((prev) => ({ ...prev, phase: 'searching', matchMode: 'private', error: null }));
    try {
      await socket.joinMatch(matchId);
      matchIdRef.current = matchId;
      setState((prev) => ({ ...prev, matchId, phase: 'waiting' }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: 'idle',
        error: err instanceof Error ? err.message : 'Failed to join match',
      }));
    }
  }, [socket]);

  const sendMove = useCallback((cell: number) => {
    if (!socket || !matchIdRef.current)  return;
    if (state.pendingCell !== null)       return; // move already in flight
    if (state.currentTurn !== myUserId)  return; // not our turn
    if (state.board[cell] !== '')        return; // cell already occupied

    // Optimistic local update — cleared when the server broadcasts back
    setState((prev) => ({ ...prev, pendingCell: cell }));

    const payload: MovePayload = { cell };
    const data = new TextEncoder().encode(JSON.stringify(payload));
    socket.sendMatchState(matchIdRef.current, OpCode.MOVE, data);
  }, [socket, state.pendingCell, state.currentTurn, myUserId, state.board]);

  const leaveMatch = useCallback(async () => {
    if (socket && matchIdRef.current) {
      try { await socket.leaveMatch(matchIdRef.current); } catch { /* best-effort */ }
      matchIdRef.current = null;
    }
    setState(initialMatchState(myUserId, myUsername));
  }, [socket, myUserId, myUsername]);

  return { state, findMatch, createMatch, joinMatch, sendMove, leaveMatch };
}
