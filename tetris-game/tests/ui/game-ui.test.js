'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createGame } = require('../../src/game/engine');
const { createGameUi } = require('../../src/ui/game-ui');

function element(tag) {
  return {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    children: [],
    listeners: {},
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren() { this.children = []; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(h => h !== fn); },
  };
}

function createFakeDocument() {
  const doc = { createElement: tag => element(tag), body: element('body') };
  doc.press = key => { for (const fn of doc.body.listeners.keydown || []) fn({ key }); };
  return doc;
}

function stubGame(state) {
  const calls = [];
  const game = {
    calls,
    getState: () => game.state,
    tick() { calls.push('tick'); },
    moveLeft() { calls.push('moveLeft'); },
    moveRight() { calls.push('moveRight'); },
    rotate() { calls.push('rotate'); },
    softDrop() { calls.push('softDrop'); },
    hardDrop() { calls.push('hardDrop'); },
  };
  game.state = state;
  return game;
}

const emptyBoard = (columns, rows) => Array.from({ length: rows }, () => new Array(columns).fill(0));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('renders one cell per board position in row-major order', () => {
  const game = stubGame({ board: [[0, 2], [5, 0]], status: 'running' });
  const document = createFakeDocument();
  const ui = createGameUi({ game, document });
  ui.stop();

  const grid = document.body.children[0];
  assert.equal(grid.children.length, 4, '4x2 board renders 8 cells');
  assert.deepEqual(grid.children.map(cell => cell.className), [
    'cell cell-0', 'cell cell-2',
    'cell cell-5', 'cell cell-0',
  ]);
});

test('covers the full 0..7 class mapping', () => {
  const board = [Array.from({ length: 8 }, (_, type) => type)];
  const document = createFakeDocument();
  const ui = createGameUi({ game: stubGame({ board, status: 'running' }), document });
  ui.stop();

  const classes = document.body.children[0].children.map(cell => cell.className);
  assert.deepEqual(classes, Array.from({ length: 8 }, (_, type) => `cell cell-${type}`));
});

test('running status shows no game-over message', () => {
  const document = createFakeDocument();
  const ui = createGameUi({ game: stubGame({ board: emptyBoard(4, 4), status: 'running' }), document });
  ui.stop();

  const message = document.body.children[1];
  assert.equal(message.textContent, '');
});

test('over status shows the game-over message', () => {
  const document = createFakeDocument();
  const ui = createGameUi({ game: stubGame({ board: emptyBoard(4, 4), status: 'over' }), document });
  ui.stop();

  assert.match(document.body.children[1].textContent, /game over/i);
});

test('render reflects state changes on the same cells', () => {
  const game = stubGame({ board: emptyBoard(2, 2), status: 'running' });
  const document = createFakeDocument();
  const ui = createGameUi({ game, document });
  ui.stop();

  game.state = { board: [[3, 0], [0, 7]], status: 'over' };
  ui.render();

  assert.deepEqual(document.body.children[0].children.map(cell => cell.className), [
    'cell cell-3', 'cell cell-0',
    'cell cell-0', 'cell cell-7',
  ]);
  assert.match(document.body.children[1].textContent, /game over/i);
});

test('auto drop calls tick repeatedly until stopped', async () => {
  const game = stubGame({ board: emptyBoard(2, 2), status: 'running' });
  const document = createFakeDocument();
  const ui = createGameUi({ game, document, intervalMs: 10 });

  await sleep(45);
  ui.stop();
  const ticksAfterRun = game.calls.filter(name => name === 'tick').length;
  assert.ok(ticksAfterRun >= 2, `tick fired automatically (${ticksAfterRun} times)`);

  await sleep(30);
  assert.equal(game.calls.filter(name => name === 'tick').length, ticksAfterRun, 'stop() ends the auto drop');
});

test('the ui registers keyboard input that drives the frozen game surface', () => {
  const game = stubGame({ board: emptyBoard(4, 4), status: 'running' });
  const document = createFakeDocument();
  const ui = createGameUi({ game, document });

  document.press('ArrowLeft');
  document.press('ArrowUp');
  ui.stop();
  assert.deepEqual(game.calls, ['moveLeft', 'rotate']);
});

test('the ui never writes board state; it only drives the frozen controller methods', () => {
  const game = stubGame({ board: emptyBoard(4, 4), status: 'running' });
  // frozen state: in strict mode any direct board write by the ui throws instead of slipping through
  game.state = Object.freeze({
    board: Object.freeze(game.state.board.map(row => Object.freeze(row))),
    status: 'running',
  });
  const document = createFakeDocument();
  const ui = createGameUi({ game, document, intervalMs: 10 });

  document.press('ArrowLeft');
  document.press('ArrowUp');
  ui.render();
  ui.stop();

  assert.deepEqual(game.state.board, emptyBoard(4, 4), 'the board is only ever written by the engine');
  assert.deepEqual(game.calls, ['moveLeft', 'rotate']);
});

test('integration: the ui renders a real engine board', () => {
  const game = createGame({ columns: 4, rows: 4, randomPiece: () => 3 });
  const document = createFakeDocument();
  const ui = createGameUi({ game, document });
  ui.stop();

  const classes = document.body.children[0].children.map(cell => cell.className);
  assert.ok(classes.includes('cell cell-3'), 'the spawned piece renders with its type');
  assert.ok(classes.includes('cell cell-0'), 'empty positions render as cell-0');
  assert.equal(classes.filter(name => name === 'cell cell-0').length, 16 - 4, 'the T piece covers 4 cells');
});
