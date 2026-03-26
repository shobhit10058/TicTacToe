package main

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"
	"tictactoe-nakama/tictactoe"
)

// Op codes for messages between client and server
const (
	OpCodeMove        = 1
	OpCodeGameState   = 2
	OpCodeGameOver    = 3
	OpCodeError       = 4
	OpCodePlayerReady = 5
	OpCodeOpponentLeft = 6
)

// MatchState holds all authoritative game state
type MatchState struct {
	Board       tictactoe.Board   `json:"board"`
	CurrentTurn string            `json:"current_turn"` // player id
	Players     [2]string         `json:"players"`      // [0]=X, [1]=O
	Symbols     map[string]string `json:"symbols"`      // user_id -> "X" or "O"
	Phase       string            `json:"phase"`        // "waiting", "playing", "finished"
	Winner      string            `json:"winner"`       // user_id or "draw" or ""
	MoveCount   int               `json:"move_count"`
}

// MoveMessage is what the client sends
type MoveMessage struct {
	Cell int `json:"cell"` // 0-8
}

// GameStateMessage is what the server broadcasts
type GameStateMessage struct {
	Board       [9]string         `json:"board"`
	CurrentTurn string            `json:"current_turn"`
	Symbols     map[string]string `json:"symbols"`
	Phase       string            `json:"phase"`
	Winner      string            `json:"winner"`
	MoveCount   int               `json:"move_count"`
}

// ErrorMessage sent on invalid action
type ErrorMessage struct {
	Message string `json:"message"`
}

// TicTacToeMatch implements runtime.Match
type TicTacToeMatch struct{}

func (m *TicTacToeMatch) MatchInit(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, params map[string]interface{}) (interface{}, int, string) {
	state := &MatchState{
		Board:   tictactoe.NewBoard(),
		Symbols: make(map[string]string),
		Phase:   "waiting",
	}
	tickRate := 1 // 1 tick per second is sufficient; moves processed on messages
	label := "{\"mode\":\"classic\"}"
	return state, tickRate, label
}

func (m *TicTacToeMatch) MatchJoinAttempt(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presence runtime.Presence, metadata map[string]string) (interface{}, bool, string) {
	ms := state.(*MatchState)
	// Only allow 2 players; reject if full or finished
	if ms.Phase == "finished" {
		return ms, false, "Match is finished"
	}
	count := 0
	for _, p := range ms.Players {
		if p != "" {
			count++
		}
	}
	if count >= 2 {
		return ms, false, "Match is full"
	}
	return ms, true, ""
}

func (m *TicTacToeMatch) MatchJoin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	ms := state.(*MatchState)
	for _, p := range presences {
		userID := p.GetUserId()
		if ms.Players[0] == "" {
			ms.Players[0] = userID
			ms.Symbols[userID] = "X"
			logger.Info("Player X joined: %s", userID)
		} else if ms.Players[1] == "" {
			ms.Players[1] = userID
			ms.Symbols[userID] = "O"
			logger.Info("Player O joined: %s", userID)
		}
	}
	if ms.Players[0] != "" && ms.Players[1] != "" && ms.Phase == "waiting" {
		ms.Phase = "playing"
		ms.CurrentTurn = ms.Players[0] // X goes first
		broadcastState(dispatcher, ms, logger)
	}
	return ms
}

func (m *TicTacToeMatch) MatchLeave(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	ms := state.(*MatchState)
	if ms.Phase == "playing" {
		for _, p := range presences {
			userID := p.GetUserId()
			// The other player wins by forfeit
			winner := ""
			for _, pid := range ms.Players {
				if pid != "" && pid != userID {
					winner = pid
					break
				}
			}
			ms.Phase = "finished"
			ms.Winner = winner
			logger.Info("Player %s left; winner is %s", userID, winner)
		}
		broadcastGameOver(dispatcher, ms, logger)
	}
	return ms
}

func (m *TicTacToeMatch) MatchLoop(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, messages []runtime.MatchData) interface{} {
	ms := state.(*MatchState)

	for _, msg := range messages {
		if msg.GetOpCode() != OpCodeMove {
			continue
		}
		if ms.Phase != "playing" {
			sendError(dispatcher, msg.GetPresence(), "Game is not in playing state", logger)
			continue
		}
		userID := msg.GetUserId()
		if userID != ms.CurrentTurn {
			sendError(dispatcher, msg.GetPresence(), "Not your turn", logger)
			continue
		}
		var move MoveMessage
		if err := json.Unmarshal(msg.GetData(), &move); err != nil {
			sendError(dispatcher, msg.GetPresence(), "Invalid message format", logger)
			continue
		}
		symbol := ms.Symbols[userID]
		newBoard, err := tictactoe.ApplyMove(ms.Board, move.Cell, symbol)
		if err != nil {
			sendError(dispatcher, msg.GetPresence(), err.Error(), logger)
			continue
		}
		ms.Board = newBoard
		ms.MoveCount++

		outcome := tictactoe.CheckOutcome(ms.Board)
		switch outcome {
		case "X", "O":
			// Find winner user ID by symbol
			for uid, sym := range ms.Symbols {
				if sym == outcome {
					ms.Winner = uid
					break
				}
			}
			ms.Phase = "finished"
			broadcastGameOver(dispatcher, ms, logger)
		case "draw":
			ms.Winner = "draw"
			ms.Phase = "finished"
			broadcastGameOver(dispatcher, ms, logger)
		default:
			// Switch turns
			if ms.CurrentTurn == ms.Players[0] {
				ms.CurrentTurn = ms.Players[1]
			} else {
				ms.CurrentTurn = ms.Players[0]
			}
			broadcastState(dispatcher, ms, logger)
		}
	}

	// End the match once it is finished (gives clients time via the last broadcast)
	if ms.Phase == "finished" {
		return nil
	}
	return ms
}

func (m *TicTacToeMatch) MatchTerminate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, graceSeconds int) interface{} {
	return state
}

func (m *TicTacToeMatch) MatchSignal(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, data string) (interface{}, string) {
	return state, ""
}

// broadcastState sends the current game state to all players.
func broadcastState(dispatcher runtime.MatchDispatcher, ms *MatchState, logger runtime.Logger) {
	msg := GameStateMessage{
		Board:       ms.Board.Cells,
		CurrentTurn: ms.CurrentTurn,
		Symbols:     ms.Symbols,
		Phase:       ms.Phase,
		Winner:      ms.Winner,
		MoveCount:   ms.MoveCount,
	}
	data, err := json.Marshal(msg)
	if err != nil {
		logger.Error("Failed to marshal game state: %v", err)
		return
	}
	if err := dispatcher.BroadcastMessage(OpCodeGameState, data, nil, nil, true); err != nil {
		logger.Error("Failed to broadcast game state: %v", err)
	}
}

// broadcastGameOver sends the final game state with OpCodeGameOver to all players.
func broadcastGameOver(dispatcher runtime.MatchDispatcher, ms *MatchState, logger runtime.Logger) {
	msg := GameStateMessage{
		Board:       ms.Board.Cells,
		CurrentTurn: ms.CurrentTurn,
		Symbols:     ms.Symbols,
		Phase:       ms.Phase,
		Winner:      ms.Winner,
		MoveCount:   ms.MoveCount,
	}
	data, err := json.Marshal(msg)
	if err != nil {
		logger.Error("Failed to marshal game over: %v", err)
		return
	}
	if err := dispatcher.BroadcastMessage(OpCodeGameOver, data, nil, nil, true); err != nil {
		logger.Error("Failed to broadcast game over: %v", err)
	}
}

// sendError sends an error message to a single presence.
func sendError(dispatcher runtime.MatchDispatcher, presence runtime.Presence, message string, logger runtime.Logger) {
	msg := ErrorMessage{Message: message}
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	if err := dispatcher.BroadcastMessage(OpCodeError, data, []runtime.Presence{presence}, nil, true); err != nil {
		logger.Error("Failed to send error: %v", err)
	}
}

// rpcCreateMatch creates a new private match and returns its ID.
func rpcCreateMatch(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	matchID, err := nk.MatchCreate(ctx, "tictactoe", map[string]interface{}{})
	if err != nil {
		return "", err
	}
	response, _ := json.Marshal(map[string]string{"match_id": matchID})
	return string(response), nil
}

// rpcFindMatch finds an existing waiting match or creates a new one.
func rpcFindMatch(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	limit := 10
	authoritative := true
	label := "{\"mode\":\"classic\"}"
	minSize := 1
	maxSize := 1 // matches with exactly 1 player (waiting for opponent)

	matches, err := nk.MatchList(ctx, limit, authoritative, label, &minSize, &maxSize, "")
	if err != nil {
		return "", err
	}

	if len(matches) > 0 {
		response, _ := json.Marshal(map[string]string{"match_id": matches[0].GetMatchId()})
		return string(response), nil
	}

	// No waiting matches found — create a new one
	matchID, err := nk.MatchCreate(ctx, "tictactoe", map[string]interface{}{})
	if err != nil {
		return "", err
	}
	response, _ := json.Marshal(map[string]string{"match_id": matchID})
	return string(response), nil
}
