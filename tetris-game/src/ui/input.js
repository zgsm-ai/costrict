'use strict';

const KEY_ACTIONS = {
  ArrowLeft: 'moveLeft',
  ArrowRight: 'moveRight',
  ArrowUp: 'rotate',
  ArrowDown: 'softDrop',
  Space: 'hardDrop',
  ' ': 'hardDrop', // browsers report the space bar key as ' '
};

function createInput({ game, document }) {
  const target = document.body || document;
  const handler = event => {
    const action = KEY_ACTIONS[event.key];
    // an over game keeps its board frozen; the engine no-ops, so just skip the call
    if (!action || game.getState().status === 'over') return;
    game[action]();
  };
  target.addEventListener('keydown', handler);
  return { destroy: () => target.removeEventListener('keydown', handler) };
}

module.exports = { createInput };
