'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createGame } = require('../../src/game/engine');

const filled = board => board.flat().filter(cell => cell !== 0).length;
const run = (game, method, times) => { for (let i = 0; i < times; i++) game[method](); };

test('getState exposes the default 20x10 board shape and running status', () => {
  const { getState } = createGame();
  const state = getState();
  assert.equal(state.status, 'running');
  assert.equal(state.board.length, 20);
  for (const row of state.board) {
    assert.equal(row.length, 10);
    assert.ok(row.every(cell => cell >= 0 && cell <= 7), 'cells are 0..7');
  }
  assert.ok(state.board.flat().some(cell => cell !== 0), 'the spawned piece is visible on the board');
});

test('getState honors custom columns and rows', () => {
  const { getState } = createGame({ columns: 4, rows: 6 });
  const state = getState();
  assert.equal(state.board.length, 6);
  assert.equal(state.board[0].length, 4);
});

test('the controller exposes exactly the frozen command surface', () => {
  const game = createGame();
  for (const name of ['getState', 'tick', 'moveLeft', 'moveRight', 'rotate', 'softDrop', 'hardDrop']) {
    assert.equal(typeof game[name], 'function', `${name} is a function`);
  }
});

test('an injected randomPiece is used verbatim for piece types', () => {
  const game = createGame({ randomPiece: () => 3 });
  const state = game.getState();
  assert.equal(state.status, 'running');
  assert.ok(state.board.flat().includes(3), 'spawned piece is rendered with its type');
});

test('without injection the engine generates types 1..7', () => {
  for (let i = 0; i < 20; i++) {
    const cells = createGame().getState().board.flat();
    assert.ok(cells.some(cell => cell >= 1 && cell <= 7), 'a piece 1..7 is on the board');
  }
});

test('tick drops the piece one row', () => {
  const game = createGame({ randomPiece: () => 1 });
  const before = game.getState().board;
  game.tick();
  const after = game.getState().board;
  assert.equal(filled(after), filled(before), 'cell count is conserved');
  assert.ok(after[1].some(cell => cell === 1), 'piece occupies row 1 after one tick');
  assert.ok(after[0].every(cell => cell === 0), 'piece left row 0');
});

test('moveLeft shifts the piece one column and respects the left wall', () => {
  const game = createGame({ randomPiece: () => 1 });
  game.moveLeft();
  let state = game.getState();
  assert.ok(state.board[0][2] === 1, 'I piece moved to columns 2..5');
  run(game, 'moveLeft', 10);
  state = game.getState();
  assert.ok(state.board[0][0] === 1 && state.board[0][3] === 1, 'piece rests against the left wall');
  assert.equal(state.status, 'running');
  assert.equal(filled(state.board), 4);
});

test('moveRight shifts the piece one column and respects the right wall', () => {
  const game = createGame({ randomPiece: () => 1 });
  game.moveRight();
  let state = game.getState();
  assert.ok(state.board[0][4] === 1, 'I piece moved to columns 4..7');
  run(game, 'moveRight', 10);
  state = game.getState();
  assert.ok(state.board[0][6] === 1 && state.board[0][9] === 1, 'piece rests against the right wall');
  assert.equal(state.status, 'running');
  assert.equal(filled(state.board), 4);
});

test('rotate turns an orientation-dependent piece', () => {
  const game = createGame({ randomPiece: () => 1 });
  game.rotate();
  const state = game.getState();
  assert.equal(filled(state.board), 4);
  assert.equal(state.board[0].filter(cell => cell === 1).length, 1, 'vertical I piece occupies one column');
  assert.ok(state.board.slice(0, 4).some(row => row[3] === 1 || row[4] === 1));
});

test('rotating a symmetric piece leaves the board unchanged', () => {
  const game = createGame({ randomPiece: () => 2 });
  const before = game.getState().board;
  game.rotate();
  assert.deepEqual(game.getState().board, before);
});

test('softDrop lowers the piece one row per call', () => {
  const game = createGame({ randomPiece: () => 1 });
  game.softDrop();
  const state = game.getState();
  assert.ok(state.board[1].some(cell => cell === 1));
  assert.ok(state.board[0].every(cell => cell === 0));
});

test('softDrop locks the piece when it cannot descend further', () => {
  const game = createGame({ columns: 4, rows: 4, randomPiece: () => 2 });
  run(game, 'softDrop', 2);
  game.softDrop(); // piece rests on the floor: this call locks it and spawns the next
  const state = game.getState();
  assert.equal(state.status, 'running');
  assert.ok(state.board[0][1] === 2 && state.board[0][2] === 2, 'new piece spawned at the top');
  assert.ok(state.board[1][1] === 2 && state.board[1][2] === 2, 'new piece is two rows tall');
  assert.ok(state.board[2][1] === 2 && state.board[2][2] === 2, 'locked piece sits on the floor');
  assert.ok(state.board[3][1] === 2 && state.board[3][2] === 2, 'locked piece occupies the bottom row');
  for (const row of state.board) assert.ok(row[0] === 0 && row[3] === 0, 'columns outside the O piece stay empty');
  assert.equal(filled(state.board), 8);
});

test('hardDrop locks the piece at the lowest free position in one call', () => {
  const game = createGame({ columns: 4, rows: 4, randomPiece: () => 2 });
  game.hardDrop();
  const state = game.getState();
  assert.equal(state.status, 'running');
  assert.ok(state.board[2][1] === 2 && state.board[3][2] === 2, 'piece locked on the floor');
  assert.ok(state.board[0][1] === 2 && state.board[0][2] === 2, 'next piece spawned');
  assert.equal(filled(state.board), 8);
});

test('hardDrop stacks onto existing cells without overlapping', () => {
  const game = createGame({ columns: 4, rows: 4, randomPiece: () => 2 });
  game.hardDrop();
  game.hardDrop(); // lands on rows 0..1, above the locked stack on rows 2..3
  const state = game.getState();
  assert.equal(filled(state.board), 8);
  for (const row of state.board) assert.ok(row.every(cell => cell === 0 || cell === 2));
});

test('locking a full playfield row clears it', () => {
  const game = createGame({ columns: 2, rows: 4, randomPiece: () => 2 });
  game.hardDrop(); // fills rows 2..3
  game.hardDrop(); // fills rows 0..1 -> both rows are full and cleared
  const state = game.getState();
  assert.equal(state.status, 'running');
  assert.equal(filled(state.board), 4, 'only the newly spawned piece remains');
  assert.ok(state.board[0][0] === 2 && state.board[0][1] === 2, 'new piece fills the top row');
  assert.ok(state.board[1][0] === 2 && state.board[1][1] === 2, 'new piece is two rows tall');
  assert.ok(state.board.slice(2).every(row => row.every(cell => cell === 0)), 'cleared rows stay empty');
});

test('the game is over when a new piece cannot spawn', () => {
  const game = createGame({ columns: 4, rows: 2, randomPiece: () => 2 });
  game.hardDrop(); // fills both rows at columns 1..2, next spawn collides
  const state = game.getState();
  assert.equal(state.status, 'over');
});

test('no command mutates the board once the game is over', () => {
  const game = createGame({ columns: 4, rows: 2, randomPiece: () => 2 });
  game.hardDrop();
  const frozen = game.getState().board;
  for (const act of ['tick', 'moveLeft', 'moveRight', 'rotate', 'softDrop', 'hardDrop']) {
    game[act]();
    assert.deepEqual(game.getState().board, frozen, `${act} keeps a finished board unchanged`);
    assert.equal(game.getState().status, 'over');
  }
});

test('getState returns a board snapshot while the game is running', () => {
  const game = createGame({ randomPiece: () => 2 });
  const state = game.getState();
  state.board[0][0] = 9;
  assert.ok(game.getState().board.flat().every(cell => cell !== 9), 'mutating a returned board cannot corrupt the game');
  assert.equal(game.getState().status, 'running');
});

test('getState returns a board snapshot once the game is over', () => {
  const game = createGame({ columns: 4, rows: 2, randomPiece: () => 2 });
  game.hardDrop(); // fills columns 1..2 on both rows: the next spawn cannot be placed
  const state = game.getState();
  assert.equal(state.status, 'over');
  state.board[0][0] = 9;
  assert.ok(game.getState().board.flat().every(cell => cell !== 9), 'mutating a finished board cannot corrupt the game');
  assert.equal(game.getState().status, 'over');
});

test('engine source never references browser globals', () => {
  for (const file of ['engine.js', 'board.js', 'pieces.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'game', file), 'utf8');
    assert.ok(!/\b(document|window|navigator)\b/.test(source), `${file} stays browser-free`);
  }
});
