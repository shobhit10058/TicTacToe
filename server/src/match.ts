// No imports — board.ts is concatenated before this file via tsconfig outFile.

const TURN_TIMEOUT_SEC = 30;
const STATS_COLLECTION = 'player_stats';
const STATS_KEY        = 'game_stats';
const LEADERBOARD_ID   = 'tictactoe_wins';

const OpCode = {
    MOVE:       1,
    GAME_STATE: 2,
    GAME_OVER:  3,
    ERROR:      4,
};

interface PlayerStats {
    wins:          number;
    losses:        number;
    draws:         number;
    currentStreak: number;
    bestStreak:    number;
    gamesPlayed:   number;
}

interface MatchState {
    board:          Board;
    currentTurn:    string;
    players:        [string, string]; // [0] = X, [1] = O
    symbols:        {[userId: string]: CellSymbol};
    phase:          'waiting' | 'playing' | 'finished';
    winner:         string;  // user ID | "draw" | ""
    moveCount:      number;
    timedMode:      boolean; // true = 30-second turn timer
    turnDeadlineMs: number;  // epoch ms when the current turn expires (0 in classic)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function broadcastState(dispatcher: nkruntime.MatchDispatcher, ms: MatchState): void {
    dispatcher.broadcastMessage(OpCode.GAME_STATE, JSON.stringify({
        board:           ms.board,
        current_turn:    ms.currentTurn,
        symbols:         ms.symbols,
        phase:           ms.phase,
        winner:          ms.winner,
        move_count:      ms.moveCount,
        timed_mode:      ms.timedMode,
        turn_deadline_ms: ms.turnDeadlineMs,
    }), null, null, true);
}

function broadcastGameOver(dispatcher: nkruntime.MatchDispatcher, ms: MatchState): void {
    dispatcher.broadcastMessage(OpCode.GAME_OVER, JSON.stringify({
        board:           ms.board,
        current_turn:    ms.currentTurn,
        symbols:         ms.symbols,
        phase:           ms.phase,
        winner:          ms.winner,
        move_count:      ms.moveCount,
        timed_mode:      ms.timedMode,
        turn_deadline_ms: 0,
    }), null, null, true);
}

function sendError(dispatcher: nkruntime.MatchDispatcher, presence: nkruntime.Presence, message: string): void {
    dispatcher.broadcastMessage(OpCode.ERROR, JSON.stringify({ message: message }), [presence], null, true);
}

// Reads a player's stats from storage, applies the result of a finished game,
// writes the updated stats back, and updates the leaderboard win count.
function recordGameResult(nk: nkruntime.Nakama, userId: string, result: 'win' | 'loss' | 'draw', logger: nkruntime.Logger): void {
    try {
        var reads = [{ collection: STATS_COLLECTION, key: STATS_KEY, userId: userId }];
        var objects = nk.storageRead(reads);

        var stats: PlayerStats = { wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0, gamesPlayed: 0 };
        if (objects && objects.length > 0 && objects[0].value) {
            stats = objects[0].value as PlayerStats;
        }

        stats.gamesPlayed++;
        if (result === 'win') {
            stats.wins++;
            stats.currentStreak++;
            if (stats.currentStreak > stats.bestStreak) stats.bestStreak = stats.currentStreak;
        } else if (result === 'loss') {
            stats.losses++;
            stats.currentStreak = 0;
        } else {
            stats.draws++;
            stats.currentStreak = 0;
        }

        nk.storageWrite([{
            collection:      STATS_COLLECTION,
            key:             STATS_KEY,
            userId:          userId,
            value:           stats,
            permissionRead:  2, // public — leaderboard can display it
            permissionWrite: 0, // server only
        }]);

        // Resolve the player's username for leaderboard display.
        var username = '';
        try {
            var users = nk.usersGetId([userId]);
            if (users && users.length > 0) username = users[0].username || '';
        } catch (ue) { /* non-fatal */ }

        nk.leaderboardRecordWrite(LEADERBOARD_ID, userId, username, stats.wins, 0, {});
    } catch (e) {
        logger.error('Failed to record game result for %s: %s', userId, e);
    }
}

// Called when a game ends — records stats for both players.
function recordMatchOutcome(nk: nkruntime.Nakama, ms: MatchState, logger: nkruntime.Logger): void {
    for (var i = 0; i < ms.players.length; i++) {
        var uid = ms.players[i];
        if (!uid) continue;
        var result: 'win' | 'loss' | 'draw';
        if (ms.winner === 'draw') {
            result = 'draw';
        } else if (ms.winner === uid) {
            result = 'win';
        } else {
            result = 'loss';
        }
        recordGameResult(nk, uid, result, logger);
    }
}

// ---------------------------------------------------------------------------
// Match lifecycle
// ---------------------------------------------------------------------------

function matchInit(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, params: {[key: string]: string}): {state: nkruntime.MatchState, tickRate: number, label: string} {
    var timedMode = params && params['mode'] === 'timed';
    var state: MatchState = {
        board:          newBoard(),
        currentTurn:    '',
        players:        ['', ''],
        symbols:        {},
        phase:          'waiting',
        winner:         '',
        moveCount:      0,
        timedMode:      timedMode,
        turnDeadlineMs: 0,
    };
    logger.info('Match initialised (mode: %s)', timedMode ? 'timed' : 'classic');
    return {
        state:    state,
        tickRate: 2, // 2 ticks/second gives ~500ms timer resolution
        label:    JSON.stringify({ mode: timedMode ? 'timed' : 'classic' }),
    };
}

function matchJoinAttempt(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, presence: nkruntime.Presence, metadata: {[key: string]: any}): {state: nkruntime.MatchState, accept: boolean, rejectMessage?: string} | null {
    var ms = state as MatchState;
    if (ms.phase === 'finished') return { state: ms, accept: false, rejectMessage: 'Match is finished' };
    var count = 0;
    for (var i = 0; i < ms.players.length; i++) { if (ms.players[i] !== '') count++; }
    if (count >= 2) return { state: ms, accept: false, rejectMessage: 'Match is full' };
    for (var i = 0; i < ms.players.length; i++) {
        if (ms.players[i] === presence.userId) return { state: ms, accept: false, rejectMessage: 'You are already in this match' };
    }
    return { state: ms, accept: true };
}

function matchJoin(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, presences: nkruntime.Presence[]): {state: nkruntime.MatchState} | null {
    var ms = state as MatchState;
    for (var i = 0; i < presences.length; i++) {
        var p = presences[i];
        if (ms.players[0] === '') {
            ms.players[0] = p.userId;
            ms.symbols[p.userId] = 'X';
            logger.info('Player X joined: %s', p.userId);
        } else if (ms.players[1] === '') {
            ms.players[1] = p.userId;
            ms.symbols[p.userId] = 'O';
            logger.info('Player O joined: %s', p.userId);
        }
    }
    if (ms.players[0] !== '' && ms.players[1] !== '' && ms.phase === 'waiting') {
        ms.phase = 'playing';
        ms.currentTurn = ms.players[0]; // X goes first
        if (ms.timedMode) ms.turnDeadlineMs = Date.now() + (TURN_TIMEOUT_SEC * 1000);
        broadcastState(dispatcher, ms);
    }
    return { state: ms };
}

function matchLeave(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, presences: nkruntime.Presence[]): {state: nkruntime.MatchState} | null {
    var ms = state as MatchState;
    if (ms.phase === 'playing') {
        for (var i = 0; i < presences.length; i++) {
            var leftId = presences[i].userId;
            ms.winner = ms.players[0] !== leftId ? ms.players[0] : ms.players[1];
            ms.phase = 'finished';
            logger.info('Player %s left; winner by forfeit: %s', leftId, ms.winner);
        }
        recordMatchOutcome(nk, ms, logger);
        broadcastGameOver(dispatcher, ms);
    }
    return { state: ms };
}

function matchLoop(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, messages: nkruntime.MatchMessage[]): {state: nkruntime.MatchState} | null {
    var ms = state as MatchState;

    // Timer: if the current player hasn't moved in time, they forfeit the turn.
    if (ms.timedMode && ms.phase === 'playing' && ms.turnDeadlineMs > 0 && Date.now() >= ms.turnDeadlineMs) {
        ms.winner = ms.currentTurn === ms.players[0] ? ms.players[1] : ms.players[0];
        ms.phase = 'finished';
        logger.info('Turn timeout: player %s forfeits; winner: %s', ms.currentTurn, ms.winner);
        recordMatchOutcome(nk, ms, logger);
        broadcastGameOver(dispatcher, ms);
        return null;
    }

    for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        if (msg.opCode !== OpCode.MOVE) continue;

        if (ms.phase !== 'playing') { sendError(dispatcher, msg.sender, 'Game is not in playing state'); continue; }
        if (msg.sender.userId !== ms.currentTurn) { sendError(dispatcher, msg.sender, 'Not your turn'); continue; }

        var move: { cell: number };
        try {
            move = JSON.parse(nk.binaryToString(msg.data));
        } catch (e) {
            sendError(dispatcher, msg.sender, 'Invalid message format');
            continue;
        }

        var symbol = ms.symbols[msg.sender.userId];
        var nextBoard: Board;
        try {
            nextBoard = applyMove(ms.board, move.cell, symbol);
        } catch (e: any) {
            sendError(dispatcher, msg.sender, e.message);
            continue;
        }

        ms.board = nextBoard;
        ms.moveCount++;

        var outcome = checkOutcome(ms.board);
        if (outcome === 'X' || outcome === 'O') {
            for (var uid in ms.symbols) {
                if (ms.symbols[uid] === outcome) { ms.winner = uid; break; }
            }
            ms.phase = 'finished';
            recordMatchOutcome(nk, ms, logger);
            broadcastGameOver(dispatcher, ms);
        } else if (outcome === 'draw') {
            ms.winner = 'draw';
            ms.phase = 'finished';
            recordMatchOutcome(nk, ms, logger);
            broadcastGameOver(dispatcher, ms);
        } else {
            ms.currentTurn = ms.currentTurn === ms.players[0] ? ms.players[1] : ms.players[0];
            if (ms.timedMode) ms.turnDeadlineMs = Date.now() + (TURN_TIMEOUT_SEC * 1000);
            broadcastState(dispatcher, ms);
        }
    }

    if (ms.phase === 'finished') return null;
    return { state: ms };
}

function matchSignal(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, data: string): {state: nkruntime.MatchState, data: string} | null {
    return { state: state, data: '' };
}

function matchTerminate(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, dispatcher: nkruntime.MatchDispatcher, tick: number, state: nkruntime.MatchState, graceSeconds: number): {state: nkruntime.MatchState} | null {
    return { state: state };
}

// ---------------------------------------------------------------------------
// RPCs
// ---------------------------------------------------------------------------

function rpcCreateMatch(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    var mode = 'classic';
    try { mode = (JSON.parse(payload || '{}')).mode || 'classic'; } catch (e) {}
    var matchId = nk.matchCreate('tictactoe', { mode: mode });
    return JSON.stringify({ match_id: matchId });
}

function rpcFindMatch(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    var mode = 'classic';
    try { mode = (JSON.parse(payload || '{}')).mode || 'classic'; } catch (e) {}
    var label = JSON.stringify({ mode: mode });
    var matches = nk.matchList(10, true, label, 1, 1, '');
    if (matches.length > 0) return JSON.stringify({ match_id: matches[0].matchId });
    var matchId = nk.matchCreate('tictactoe', { mode: mode });
    return JSON.stringify({ match_id: matchId });
}

// Returns the calling player's lifetime stats.
function rpcGetMyStats(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    var userId = ctx.userId;
    if (!userId) return JSON.stringify({ error: 'Not authenticated' });
    try {
        var objects = nk.storageRead([{ collection: STATS_COLLECTION, key: STATS_KEY, userId: userId }]);
        var stats: PlayerStats = { wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0, gamesPlayed: 0 };
        if (objects && objects.length > 0 && objects[0].value) stats = objects[0].value as PlayerStats;
        return JSON.stringify(stats);
    } catch (e) {
        logger.error('rpcGetMyStats error: %s', e);
        return JSON.stringify({ error: 'Failed to fetch stats' });
    }
}

// Returns the top 10 players on the wins leaderboard.
function rpcGetLeaderboard(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    try {
        var result = nk.leaderboardRecordsList(LEADERBOARD_ID, [], 10, '', 0);
        var records = (result && result.records) ? result.records : [];
        var rows = [];
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            rows.push({ rank: r.rank, username: r.username, wins: r.score });
        }
        return JSON.stringify({ records: rows });
    } catch (e) {
        logger.error('rpcGetLeaderboard error: %s', e);
        return JSON.stringify({ records: [] });
    }
}

function rpcCheckOnline(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!ctx.userId) return JSON.stringify({ error: 'Not authenticated' });
    var users = nk.usersGetId([ctx.userId]);
    if (users && users.length > 0 && users[0].online) {
        return JSON.stringify({ error: 'This username already has an active session' });
    }
    return JSON.stringify({ online: false });
}

function matchmakerMatched(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, matches: nkruntime.MatchmakerResult[]): string | void {
    var mode = 'classic';
    if (matches && matches.length > 0 && matches[0].properties) {
        mode = (matches[0].properties['mode'] as string) || 'classic';
    }
    var matchId = nk.matchCreate('tictactoe', { mode: mode });
    logger.info('Matchmaker created match %s (mode: %s)', matchId, mode);
    return matchId;
}
