'use strict';
const { SHAPES, rotate } = require('./pieces');
const { createBoard, collides, merge, clearLines } = require('./board');

function createGame({ columns = 10, rows = 20, randomPiece } = {}) {
  const nextType = randomPiece || (() => 1 + Math.floor(Math.random() * 7));
  let board = createBoard(columns, rows);
  let status = 'running';
  let piece = spawn();

  function spawn() {
    const type = nextType();
    const cells = SHAPES[type];
    const next = { type, cells, x: Math.floor((columns - cells[0].length) / 2), y: 0 };
    if (collides(board, next)) {
      status = 'over';
      return null;
    }
    return next;
  }

  function lock() {
    board = clearLines(merge(board, piece)).board;
    piece = spawn();
  }

  function tryMove(dx, dy) {
    if (!piece) return;
    const moved = { ...piece, x: piece.x + dx, y: piece.y + dy };
    if (!collides(board, moved)) piece = moved;
    else if (dy > 0) lock();
  }

  return {
    getState() {
      // always copy: `board` is internal state once the game is over (no active piece to merge)
      return { board: (piece ? merge(board, piece) : board).map(row => row.slice()), status };
    },
    tick() { tryMove(0, 1); },
    softDrop() { tryMove(0, 1); },
    hardDrop() {
      if (!piece) return;
      while (!collides(board, { ...piece, y: piece.y + 1 })) piece = { ...piece, y: piece.y + 1 };
      lock();
    },
    moveLeft() { tryMove(-1, 0); },
    moveRight() { tryMove(1, 0); },
    rotate() {
      if (!piece) return;
      const cells = rotate(piece.cells);
      for (const dx of [0, -1, 1]) {
        const turned = { ...piece, cells, x: piece.x + dx };
        if (!collides(board, turned)) {
          piece = turned;
          return;
        }
      }
    },
  };
}

module.exports = { createGame };
