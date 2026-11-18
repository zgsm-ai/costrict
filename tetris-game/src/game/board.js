'use strict';
function createBoard(columns, rows) {
  return Array.from({ length: rows }, () => new Array(columns).fill(0));
}

function collides(board, piece) {
  const rows = board.length;
  const columns = board[0].length;
  for (let y = 0; y < piece.cells.length; y++) {
    for (let x = 0; x < piece.cells[y].length; x++) {
      if (!piece.cells[y][x]) continue;
      const by = piece.y + y;
      const bx = piece.x + x;
      if (bx < 0 || bx >= columns || by >= rows) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
  }
  return false;
}

function merge(board, piece) {
  const out = board.map(row => row.slice());
  piece.cells.forEach((row, y) => row.forEach((cell, x) => {
    if (cell) out[piece.y + y][piece.x + x] = piece.type;
  }));
  return out;
}

function clearLines(board) {
  const kept = board.filter(row => row.some(cell => !cell));
  const cleared = board.length - kept.length;
  while (kept.length < board.length) kept.unshift(new Array(board[0].length).fill(0));
  return { board: kept, cleared };
}

module.exports = { createBoard, collides, merge, clearLines };
