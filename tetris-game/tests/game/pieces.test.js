'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { SHAPES, rotate } = require('../../src/game/pieces');

test('SHAPES defines exactly piece types 1..7', () => {
  assert.deepEqual(Object.keys(SHAPES).sort(), ['1', '2', '3', '4', '5', '6', '7']);
});

test('every shape is a non-empty binary matrix with rectangular rows', () => {
  for (const type of Object.keys(SHAPES)) {
    const cells = SHAPES[type];
    assert.ok(cells.length > 0, `type ${type} has rows`);
    const width = cells[0].length;
    for (const row of cells) {
      assert.equal(row.length, width, `type ${type} is rectangular`);
      for (const cell of row) assert.ok(cell === 0 || cell === 1, `type ${type} cells are binary`);
    }
    assert.ok(cells.some(row => row.some(cell => cell === 1)), `type ${type} has at least one cell`);
  }
});

test('rotate turns a matrix 90 degrees clockwise', () => {
  assert.deepEqual(rotate([[1, 0], [1, 1]]), [[1, 1], [1, 0]]);
});

test('rotate swaps row and column counts', () => {
  const rotated = rotate([[1, 1, 1, 1]]);
  assert.equal(rotated.length, 4);
  assert.equal(rotated[0].length, 1);
});

test('rotate preserves the number of filled cells', () => {
  const shape = SHAPES[5];
  const filled = rows => rows.reduce((sum, row) => sum + row.filter(cell => cell === 1).length, 0);
  assert.equal(filled(rotate(shape)), filled(shape));
});

test('rotating four times returns the original shape', () => {
  for (const type of Object.keys(SHAPES)) {
    let cells = SHAPES[type];
    for (let i = 0; i < 4; i++) cells = rotate(cells);
    assert.deepEqual(cells, SHAPES[type], `type ${type} is stable after four rotations`);
  }
});
