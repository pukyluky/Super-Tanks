const {
  GRID_W,
  GRID_H,
  CELL_EMPTY,
  CELL_STEEL,
  BRICK_MAX_HP
} = require('../config/constants');

function createEmptyGrid() {
  const grid = Array.from({ length: GRID_H }, () => new Int8Array(GRID_W));
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (x < 2 || x >= GRID_W - 2 || y < 2 || y >= GRID_H - 2) {
        grid[y][x] = CELL_STEEL;
      } else {
        grid[y][x] = CELL_EMPTY;
      }
    }
  }
  return grid;
}

function paintRect(grid, x0, y0, w, h, val) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x >= 2 && x < GRID_W - 2 && y >= 2 && y < GRID_H - 2) {
        grid[y][x] = val;
      }
    }
  }
}

function generateArena(mapStyle = 'bunkers') {
  const grid = createEmptyGrid();

  if (mapStyle === 'labyrinth') {
    for (let bx = 18; bx <= 98; bx += 20) {
      paintRect(grid, bx, 10, 4, 18, BRICK_MAX_HP);
      paintRect(grid, bx, 44, 4, 18, BRICK_MAX_HP);
    }
    paintRect(grid, 36, 28, 6, 16, BRICK_MAX_HP);
    paintRect(grid, 78, 28, 6, 16, BRICK_MAX_HP);
    paintRect(grid, 56, 32, 8, 8, CELL_STEEL);
    paintRect(grid, 52, 16, 16, 4, BRICK_MAX_HP);
    paintRect(grid, 52, 52, 16, 4, BRICK_MAX_HP);
  } else if (mapStyle === 'open') {
    const blocks = [
      [24, 14, 6, 8], [24, 50, 6, 8],
      [90, 14, 6, 8], [90, 50, 6, 8],
      [44, 24, 5, 10], [71, 38, 5, 10],
      [55, 12, 10, 4], [55, 56, 10, 4]
    ];
    for (const [x, y, w, h] of blocks) {
      paintRect(grid, x, y, w, h, BRICK_MAX_HP);
    }
    paintRect(grid, 58, 34, 4, 4, CELL_STEEL);
  } else {
    paintRect(grid, 22, 16, 5, 16, BRICK_MAX_HP);
    paintRect(grid, 22, 40, 5, 16, BRICK_MAX_HP);
    paintRect(grid, 93, 16, 5, 16, BRICK_MAX_HP);
    paintRect(grid, 93, 40, 5, 16, BRICK_MAX_HP);

    paintRect(grid, 44, 18, 6, 12, BRICK_MAX_HP);
    paintRect(grid, 44, 42, 6, 12, BRICK_MAX_HP);
    paintRect(grid, 70, 18, 6, 12, BRICK_MAX_HP);
    paintRect(grid, 70, 42, 6, 12, BRICK_MAX_HP);

    paintRect(grid, 58, 10, 4, 6, CELL_STEEL);
    paintRect(grid, 58, 56, 4, 6, CELL_STEEL);
    paintRect(grid, 57, 33, 6, 6, BRICK_MAX_HP);

    paintRect(grid, 34, 8, 12, 3, BRICK_MAX_HP);
    paintRect(grid, 74, 8, 12, 3, BRICK_MAX_HP);
    paintRect(grid, 34, 61, 12, 3, BRICK_MAX_HP);
    paintRect(grid, 74, 61, 12, 3, BRICK_MAX_HP);
  }

  return grid;
}

module.exports = {
  createEmptyGrid,
  paintRect,
  generateArena
};
