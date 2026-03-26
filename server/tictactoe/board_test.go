package tictactoe

import "testing"

func TestApplyMove_Valid(t *testing.T) {
	b := NewBoard()
	b2, err := ApplyMove(b, 0, "X")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if b2.Cells[0] != "X" {
		t.Errorf("expected X at cell 0, got %q", b2.Cells[0])
	}
	// Original board unchanged (value semantics — immutable)
	if b.Cells[0] != "" {
		t.Error("original board should be unchanged")
	}
}

func TestApplyMove_OccupiedCell(t *testing.T) {
	b := NewBoard()
	b.Cells[4] = "X"
	_, err := ApplyMove(b, 4, "O")
	if err == nil {
		t.Error("expected error for occupied cell")
	}
}

func TestApplyMove_InvalidCell(t *testing.T) {
	b := NewBoard()
	_, err := ApplyMove(b, 9, "X")
	if err == nil {
		t.Error("expected error for cell 9")
	}
	_, err = ApplyMove(b, -1, "X")
	if err == nil {
		t.Error("expected error for cell -1")
	}
}

func TestApplyMove_InvalidSymbol(t *testing.T) {
	b := NewBoard()
	_, err := ApplyMove(b, 0, "Z")
	if err == nil {
		t.Error("expected error for invalid symbol Z")
	}
	_, err = ApplyMove(b, 0, "")
	if err == nil {
		t.Error("expected error for empty symbol")
	}
}

func TestCheckOutcome_XWinsRow(t *testing.T) {
	tests := []struct {
		name  string
		cells [9]string
	}{
		{"top row", [9]string{"X", "X", "X", "", "", "", "", "", ""}},
		{"mid row", [9]string{"", "", "", "X", "X", "X", "", "", ""}},
		{"bot row", [9]string{"", "", "", "", "", "", "X", "X", "X"}},
	}
	for _, tt := range tests {
		b := NewBoard()
		b.Cells = tt.cells
		if got := CheckOutcome(b); got != "X" {
			t.Errorf("%s: expected X, got %q", tt.name, got)
		}
	}
}

func TestCheckOutcome_OWinsCol(t *testing.T) {
	tests := []struct {
		name  string
		cells [9]string
	}{
		{"left col", [9]string{"O", "", "", "O", "", "", "O", "", ""}},
		{"mid col", [9]string{"", "O", "", "", "O", "", "", "O", ""}},
		{"right col", [9]string{"", "", "O", "", "", "O", "", "", "O"}},
	}
	for _, tt := range tests {
		b := NewBoard()
		b.Cells = tt.cells
		if got := CheckOutcome(b); got != "O" {
			t.Errorf("%s: expected O, got %q", tt.name, got)
		}
	}
}

func TestCheckOutcome_XWinsDiag(t *testing.T) {
	b := NewBoard()
	b.Cells[0] = "X"
	b.Cells[4] = "X"
	b.Cells[8] = "X"
	if got := CheckOutcome(b); got != "X" {
		t.Errorf("expected X (main diag), got %q", got)
	}

	b2 := NewBoard()
	b2.Cells[2] = "X"
	b2.Cells[4] = "X"
	b2.Cells[6] = "X"
	if got := CheckOutcome(b2); got != "X" {
		t.Errorf("expected X (anti-diag), got %q", got)
	}
}

func TestCheckOutcome_Draw(t *testing.T) {
	b := NewBoard()
	// X O X / O X X / O X O — full board, no winner
	b.Cells = [9]string{"X", "O", "X", "O", "X", "X", "O", "X", "O"}
	if got := CheckOutcome(b); got != "draw" {
		t.Errorf("expected draw, got %q", got)
	}
}

func TestCheckOutcome_InProgress(t *testing.T) {
	b := NewBoard()
	b.Cells[0] = "X"
	if got := CheckOutcome(b); got != "" {
		t.Errorf("expected empty (in progress), got %q", got)
	}
}

func TestCheckOutcome_EmptyBoard(t *testing.T) {
	b := NewBoard()
	if got := CheckOutcome(b); got != "" {
		t.Errorf("expected empty (fresh board), got %q", got)
	}
}

func TestCheckOutcome_AllWinLines(t *testing.T) {
	lines := [][3]int{
		{0, 1, 2}, {3, 4, 5}, {6, 7, 8}, // rows
		{0, 3, 6}, {1, 4, 7}, {2, 5, 8}, // cols
		{0, 4, 8}, {2, 4, 6},            // diagonals
	}
	for _, line := range lines {
		b := NewBoard()
		b.Cells[line[0]] = "X"
		b.Cells[line[1]] = "X"
		b.Cells[line[2]] = "X"
		if got := CheckOutcome(b); got != "X" {
			t.Errorf("line %v: expected X, got %q", line, got)
		}
	}
}

func TestApplyMove_AllCells(t *testing.T) {
	for i := 0; i <= 8; i++ {
		b := NewBoard()
		b2, err := ApplyMove(b, i, "O")
		if err != nil {
			t.Errorf("cell %d: unexpected error %v", i, err)
			continue
		}
		if b2.Cells[i] != "O" {
			t.Errorf("cell %d: expected O, got %q", i, b2.Cells[i])
		}
	}
}

func TestCheckOutcome_FullSequence(t *testing.T) {
	// Simulate a full game: X wins on move 5
	b := NewBoard()
	moves := []struct {
		cell   int
		symbol string
	}{
		{0, "X"}, {1, "O"}, {3, "X"}, {4, "O"}, {6, "X"}, // X wins left col
	}
	for _, mv := range moves {
		var err error
		b, err = ApplyMove(b, mv.cell, mv.symbol)
		if err != nil {
			t.Fatalf("move cell=%d sym=%s: %v", mv.cell, mv.symbol, err)
		}
	}
	if got := CheckOutcome(b); got != "X" {
		t.Errorf("expected X to win, got %q", got)
	}
}
