// No import/export — all declarations are global in Nakama's runtime context.
// TypeScript's outFile concatenates script files; match.ts can use these directly.

type CellSymbol = 'X' | 'O' | '';
type Board = CellSymbol[];

const WINNING_LINES: number[][] = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6],             // diagonals
];

function newBoard(): Board {
    return ['', '', '', '', '', '', '', '', ''] as Board;
}

// Returns a new board with the move applied. Throws if the move is invalid.
// The original board is never mutated.
function applyMove(board: Board, cell: number, symbol: CellSymbol): Board {
    if (cell < 0 || cell > 8) throw new Error('Cell must be between 0 and 8');
    if (symbol !== 'X' && symbol !== 'O') throw new Error('Symbol must be X or O');
    if (board[cell] !== '') throw new Error('Cell is already occupied');
    var next = board.slice() as Board;
    next[cell] = symbol;
    return next;
}

// Returns "X" or "O" if that player won, "draw" if full with no winner, "" if still in progress.
function checkOutcome(board: Board): 'X' | 'O' | 'draw' | '' {
    for (var i = 0; i < WINNING_LINES.length; i++) {
        var line = WINNING_LINES[i];
        var a = board[line[0]], b = board[line[1]], c = board[line[2]];
        if (a !== '' && a === b && b === c) return a as 'X' | 'O';
    }
    for (var j = 0; j < board.length; j++) {
        if (board[j] === '') return '';
    }
    return 'draw';
}
