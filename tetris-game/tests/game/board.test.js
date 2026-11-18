'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createBoard, collides, merge, clearLines } = require('../../src/game/board');

const piece = (type, x, y, cells) => ({ type, x, y, cells });

test('createBoard builds a row-major board filled with zeros', () => {
  const board = createBoard(10, 20);
  assert.equal(board.length, 20);
  for (const row of board) {
    assert.equal(row.length, 10);
    assert.ok(row.every(cell => cell === 0));
  }
});

test('createBoard supports custom dimensions', () => {
  const board = createBoard(4, 6);
  assert.equal(board.length, 6);
  assert.equal(board[0].length, 4);
});

test('collides rejects a piece past the left wall', () => {
  const board = createBoard(4, 4);
  assert.ok(collides(board, piece(1, -1, 0, [[1, 1]])));
});

test('collides rejects a piece past the right wall', () => {
  const board = createBoard(4, 4);
  assert.ok(collides(board, piece(1, 4, 0, [[1, 1]])));
});

test('collides rejects a piece past the floor', () => {
  const board = createBoard(4, 4);
  assert.ok(collides(board, piece(1, 0, 4, [[1, 1]])));
});

test('collides rejects a piece overlapping an occupied cell', () => {
  const board = createBoard(4, 4);
  board[2][1] = 3;
  assert.ok(collides(board, piece(1, 0, 2, [[1, 1]])));
});

test('collides accepts a piece in a free position', () => {
  const board = createBoard(4, 4);
  assert.ok(!collides(board, piece(1, 0, 0, [[1, 1]])));
});

test('merge writes the piece type and leaves other cells untouched', () => {
  const board = createBoard(4, 4);
  board[0][3] = 5;
  const merged = merge(board, piece(2, 1, 1, [[1, 0], [1, 1]]));
  assert.equal(merged[1][1], 2);
  assert.equal(merged[1][2], 0);
  assert.equal(merged[2][1], 2);
  assert.equal(merged[2][2], 2);
  assert.equal(merged[0][3], 5);
});

test('merge does not mutate the input board', () => {
  const board = createBoard(4, 4);
  merge(board, piece(7, 0, 0, [[1]]));
  assert.ok(board.flat().every(cell => cell === 0));
});

test('clearLines removes only full rows and reports the count', () => {
  const board = createBoard(3, 4);
  board[2] = [4, 4, 4];
  board[3] = [4, 4, 4];
  board[1] = [4, 0, 4];
  const result = clearLines(board);
  assert.equal(result.cleared, 2);
  assert.deepEqual(result.board, [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [4, 0, 4],
  ]);
});

test('clearLines keeps row order of surviving rows', () => {
  const board = createBoard(2, 3);
  board[0] = [1, 0];
  board[2] = [3, 4];
  const result = clearLines(board);
  assert.equal(result.cleared, 1);
  assert.deepEqual(result.board, [[0, 0], [1, 0], [0, 0]], 'survivors keep their order, empties pad the top');
});
