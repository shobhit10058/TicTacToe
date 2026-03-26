package main

import (
	"context"
	"database/sql"

	"github.com/heroiclabs/nakama-common/runtime"
)

func InitModule(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, initializer runtime.Initializer) error {
	logger.Info("Initializing Tic-Tac-Toe module")

	if err := initializer.RegisterMatch("tictactoe", func(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule) (runtime.Match, error) {
		return &TicTacToeMatch{}, nil
	}); err != nil {
		return err
	}

	if err := initializer.RegisterRpc("create_match", rpcCreateMatch); err != nil {
		return err
	}

	if err := initializer.RegisterRpc("find_match", rpcFindMatch); err != nil {
		return err
	}

	logger.Info("Tic-Tac-Toe module initialized successfully")
	return nil
}
