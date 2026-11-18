'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createGame } = require('../../src/game/engine');
const { createInput } = require('../../src/ui/input');

function element(tag) {
  return {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    children: [],
    listeners: {},
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(h => h !== fn); },
  };
}

function createFakeDocument() {
  const doc = { createElement: tag => element(tag), body: element('body') };
  doc.press = key => { for (const fn of doc.body.listeners.keydown || []) fn({ key }); };
  return doc;
}

function stubGame() {
  const calls = [];
  return {
    calls,
    getState: () => ({ board: [[0]], status: 'running' }),
    tick() { calls.push('tick'); },
    moveLeft() { calls.push('moveLeft'); },
    moveRight() { calls.push('moveRight'); },
    rotate() { calls.push('rotate'); },
    softDrop() { calls.push('softDrop'); },
    hardDrop() { calls.push('hardDrop'); },
  };
}

test('the five frozen key bindings drive the matching game methods', () => {
  const cases = [
    ['ArrowLeft', 'moveLeft'],
    ['ArrowRight', 'moveRight'],
    ['ArrowUp', 'rotate'],
    ['ArrowDown', 'softDrop'],
    ['Space', 'hardDrop'],
    [' ', 'hardDrop'],
  ];
  for (const [key, expected] of cases) {
    const game = stubGame();
    const document = createFakeDocument();
    const input = createInput({ game, document });
    document.press(key);
    input.destroy();
    assert.deepEqual(game.calls, [expected], `${key} maps to ${expected}`);
  }
});

test('multiple presses keep working in order', () => {
  const game = stubGame();
  const document = createFakeDocument();
  const input = createInput({ game, document });

  document.press('ArrowLeft');
  document.press('ArrowRight');
  document.press('ArrowDown');
  input.destroy();

  assert.deepEqual(game.calls, ['moveLeft', 'moveRight', 'softDrop']);
});

test('unmapped keys are ignored', () => {
  const game = stubGame();
  const document = createFakeDocument();
  const input = createInput({ game, document });

  document.press('KeyA');
  document.press('Enter');
  document.press('Shift');
  input.destroy();

  assert.deepEqual(game.calls, []);
});

test('destroy stops listening', () => {
  const game = stubGame();
  const document = createFakeDocument();
  const input = createInput({ game, document });

  input.destroy();
  document.press('ArrowLeft');

  assert.deepEqual(game.calls, []);
});

test('an over game keeps its board unchanged when keys are pressed', () => {
  // the S piece locks with its column filled and no line cleared, so the next spawn collides
  const game = createGame({ columns: 2, rows: 3, randomPiece: () => 6 });
  game.hardDrop();
  assert.equal(game.getState().status, 'over');
  const before = game.getState().board;

  const document = createFakeDocument();
  const input = createInput({ game, document });
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', ' ']) document.press(key);
  input.destroy();

  assert.equal(game.getState().status, 'over');
  assert.deepEqual(game.getState().board, before);
});
