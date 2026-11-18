'use strict';

// renamed so the browser <script> load cannot collide with input.js's global createInput
const { createInput: bindInput } = require('./input');

function createGameUi({ game, document, intervalMs = 1000 }) {
  const grid = document.createElement('div');
  grid.className = 'board';
  const message = document.createElement('div');
  message.className = 'message';
  const target = document.body || document;
  target.appendChild(grid);
  target.appendChild(message);

  const cells = [];
  let columns = 0;
  let rows = 0;

  function render() {
    const { board, status } = game.getState();
    if (board.length !== rows || board[0].length !== columns) {
      columns = board[0].length;
      rows = board.length;
      grid.replaceChildren();
      cells.length = 0;
      for (let i = 0; i < columns * rows; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell cell-0';
        grid.appendChild(cell);
        cells.push(cell);
      }
    }
    board.forEach((row, y) => row.forEach((value, x) => {
      cells[y * columns + x].className = `cell cell-${value}`;
    }));
    message.textContent = status === 'over' ? 'GAME OVER' : '';
  }

  // every command renders, so key moves and the over transition are visible immediately
  const driven = { getState: () => game.getState() };
  for (const name of ['tick', 'moveLeft', 'moveRight', 'rotate', 'softDrop', 'hardDrop']) {
    driven[name] = () => { game[name](); render(); };
  }

  const input = bindInput({ game: driven, document });
  render();
  // timer.unref keeps node --test from hanging if a test forgets stop()
  const timer = setInterval(() => driven.tick(), intervalMs);
  if (timer.unref) timer.unref();

  return {
    render,
    stop() {
      clearInterval(timer);
      input.destroy();
    },
  };
}

module.exports = { createGameUi };
