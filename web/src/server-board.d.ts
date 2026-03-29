declare module '@server/board' {
  type CellSymbol = 'X' | 'O' | '';
  type Board = CellSymbol[];
  export const WINNING_LINES: number[][];
  export function newBoard(): Board;
  export function applyMove(board: Board, cell: number, symbol: CellSymbol): Board;
  export function checkOutcome(board: Board): 'X' | 'O' | 'draw' | '';
}
