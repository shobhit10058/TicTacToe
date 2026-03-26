// Entry point — Nakama calls InitModule on startup.
// All functions referenced here are declared in the global scope via board.ts and match.ts.

function InitModule(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, initializer: nkruntime.Initializer): void {
    logger.info('Initialising Tic-Tac-Toe module');

    // Register the authoritative match handler under the name "tictactoe".
    initializer.registerMatch('tictactoe', {
        matchInit:        matchInit,
        matchJoinAttempt: matchJoinAttempt,
        matchJoin:        matchJoin,
        matchLeave:       matchLeave,
        matchLoop:        matchLoop,
        matchSignal:      matchSignal,
        matchTerminate:   matchTerminate,
    });

    // When the matchmaker pairs two quick-match tickets, create an authoritative match.
    initializer.registerMatchmakerMatched(matchmakerMatched);

    // Create the wins leaderboard (idempotent — safe to call on every startup).
    nk.leaderboardCreate(
        'tictactoe_wins',   // id  — must match LEADERBOARD_ID in match.ts
        false,              // authoritative (server-only writes)
        nkruntime.SortOrder.DESCENDING, // sort order: highest wins first
        nkruntime.Operator.SET,         // operator: overwrite with latest total
        null,               // reset schedule (null = never)
        {}                  // metadata
    );

    // RPCs callable from the client.
    initializer.registerRpc('create_match',   rpcCreateMatch);
    initializer.registerRpc('find_match',     rpcFindMatch);
    initializer.registerRpc('get_my_stats',   rpcGetMyStats);
    initializer.registerRpc('get_leaderboard', rpcGetLeaderboard);

    logger.info('Tic-Tac-Toe module initialised successfully');
}
