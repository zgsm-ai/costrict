'use strict';
const SHAPES = {
  1: [[1, 1, 1, 1]],
  2: [[1, 1], [1, 1]],
  3: [[0, 1, 0], [1, 1, 1]],
  4: [[0, 1, 1], [1, 1, 0]],
  5: [[1, 1, 0], [0, 1, 1]],
  6: [[1, 0], [1, 1], [1, 0]],
  7: [[0, 1], [1, 1], [0, 1]],
};

// clockwise: transpose then read each old column bottom-up
function rotate(cells) {
  return cells[0].map((_, x) => cells.map(row => row[x]).reverse());
}

module.exports = { SHAPES, rotate };
