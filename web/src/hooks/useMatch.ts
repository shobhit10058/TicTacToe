import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket, Client, Session } from '@heroiclabs/nakama-js';
import { OpCode, MovePayload, ErrorPayload, Symbol as GameSymbol } from '../protocol/types';
import { applyServerState } from '../game/reducer';

export type MatchPhase = 'idle' | 'searching' | 'waiting' | 'playing' | 'finished';

// MatchState is defined independently (not extending GameState) to avoid
// a TypeScript widening conflict on the `phase` field.
export interface MatchState {
  matchId: string | null;
  phase: MatchPhase;
  board: GameSymbol[];
  currentTurn: string;
  mySymbol: GameSymbol;
  opponentSymbol: GameSymbol;
  winner: string;
  myUserId: string;
  error: string | null;
  pendingCell: number | null;
}

function initialMatchState(myUserId: string): MatchState {
  return {
    matchId: null,
    phase: 'idle',
    board: Array(9).fill('') as GameSymbol[],
    currentTurn: '',
    mySymbol: '',
    opponentSymbol: '',
    winner: '',
    myUserId,
    error: null,
    pendingCell: null,
  };
}

export function useMatch(
  socket: Socket | null,
  client: Client | null,
  session: Session | null,
) {
  const myUserId   = session?.user_id ?? '';
  const [state, setState] = useState<MatchState>(() => initialMatchState(myUserId));
  const matchIdRef = useRef<string | null>(null);

  // Wire up socket listeners whenever the socket reference changes
  useEffect(() => {
    if (!socket) return;

    socket.onmatchdata = (matchData) => {
      const opCode  = matchData.op_code;
      const raw     = new TextDecoder().decode(matchData.data as ArrayBuffer);
      const payload = JSON.parse(raw);

      if (opCode === OpCode.GAME_STATE || opCode === OpCode.GAME_OVER) {
        setState((prev) => {
          const next = applyServerState(prev, payload, myUserId);
          return {
            ...prev,
            board:           next.board,
            currentTurn:     next.currentTurn,
            mySymbol:        next.mySymbol,
            opponentSymbol:  next.opponentSymbol,
            phase:           next.phase,
            winner:          next.winner,
            pendingCell:     next.pendingCell,
            error:           null,
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

    // Nakama matchmaker paired two tickets — join the authoritative match
    socket.onmatchmakermatched = async (matched) => {
      try {
        const match = await socket.joinMatch(undefined, matched.token);
        matchIdRef.current = match.match_id;
        setState((prev) => ({ ...prev, matchId: match.match_id, phase: 'waiting' }));
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
  const findMatch = useCallback(async () => {
    if (!socket) return;
    setState((prev) => ({ ...prev, phase: 'searching', error: null }));
    try {
      await socket.addMatchmaker('*', 2, 2, {}, {});
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
  const createMatch = useCallback(async () => {
    if (!client || !session) return;
    setState((prev) => ({ ...prev, phase: 'searching', error: null }));
    try {
      const result       = await client.rpc(session, 'create_match', '');
      const { match_id } = JSON.parse(result.payload ?? '{}') as { match_id: string };
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
    setState((prev) => ({ ...prev, phase: 'searching', error: null }));
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
    setState(initialMatchState(myUserId));
  }, [socket, myUserId]);

  return { state, findMatch, createMatch, joinMatch, sendMove, leaveMatch };
}
