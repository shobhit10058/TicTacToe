package tictactoe

import "errors"

// Board holds a 3x3 tic-tac-toe state as a flat 9-element array.
// Empty cells are "". Played cells are "X" or "O".
type Board struct {
	Cells [9]string
}

// NewBoard returns an empty board.
func NewBoard() Board {
	return Board{}
}

// ApplyMove returns a new board with the move applied, or an error if the move is invalid.
// The original board is never modified (value semantics).
func ApplyMove(b Board, cell int, symbol string) (Board, error) {
	if cell < 0 || cell > 8 {
		return b, errors.New("cell must be between 0 and 8")
	}
	if symbol != "X" && symbol != "O" {
		return b, errors.New("symbol must be X or O")
	}
	if b.Cells[cell] != "" {
		return b, errors.New("cell is already occupied")
	}
	next := b
	next.Cells[cell] = symbol
	return next, nil
}

// CheckOutcome returns "X", "O", "draw", or "" if the game is still in progress.
func CheckOutcome(b Board) string {
	lines := [8][3]int{
		{0, 1, 2}, {3, 4, 5}, {6, 7, 8}, // rows
		{0, 3, 6}, {1, 4, 7}, {2, 5, 8}, // cols
		{0, 4, 8}, {2, 4, 6},            // diagonals
	}
	for _, line := range lines {
		a, b2, c := b.Cells[line[0]], b.Cells[line[1]], b.Cells[line[2]]
		if a != "" && a == b2 && a == c {
			return a
		}
	}
	// Check for draw: all cells filled, no winner
	for _, cell := range b.Cells {
		if cell == "" {
			return "" // game still in progress
		}
	}
	return "draw"
}
