# tetris-game

A small Tetris game: a browser-free engine (`src/game`) plus a Web UI (`src/ui`, `index.html`).

## Run

No build step or install needed. Either open the page directly:

```
tetris-game/index.html
```

in a browser, or serve the folder:

```sh
cd tetris-game
npx --yes serve .   # or: python3 -m http.server
```

then open the printed URL. The game starts immediately.

## Controls

| Key | Action |
| --- | --- |
| `←` | Move left |
| `→` | Move right |
| `↑` | Rotate clockwise |
| `↓` | Soft drop (one row) |
| `Space` | Hard drop (drop to the floor and lock) |

Pieces fall automatically every second. Clearing a full row removes it; when a new
piece cannot spawn, the game is over and `GAME OVER` is shown.

## Tests

From the repository root:

```sh
npm test
```

runs the engine and UI tests with `node --test` (no browser required; the UI tests
use a fake injected `document`).
