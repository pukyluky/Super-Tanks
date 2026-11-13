import { CELL_PX } from '../constants.js';
import { state, terrainCtx } from '../state.js';
import { BRICK_PALETTES } from './palettes.js';

export const EMPTY_TILE_SPRITE = {
  draw(tctx, x, y, px, py) {
    const checker = (x + y) % 2 === 0;
    tctx.fillStyle = checker ? '#171f2c' : '#151c28';
    tctx.fillRect(px, py, CELL_PX, CELL_PX);

    if (x % 4 === 0) {
      tctx.fillStyle = 'rgba(148, 163, 184, 0.05)';
      tctx.fillRect(px, py, 1, CELL_PX);
    }
    if (y % 4 === 0) {
      tctx.fillStyle = 'rgba(148, 163, 184, 0.05)';
      tctx.fillRect(px, py, CELL_PX, 1);
    }

    if (state.rubbleSet.has(`${x},${y}`)) {
      tctx.fillStyle = '#47362b';
      tctx.fillRect(px + 1, py + 2, 2, 2);
      tctx.fillRect(px + 5, py + 5, 2, 2);
      tctx.fillStyle = '#2e231c';
      tctx.fillRect(px + 4, py + 1, 2, 1);
    }
  }
};

export const STEEL_TILE_SPRITE = {
  draw(tctx, _x, _y, px, py) {
    tctx.fillStyle = '#334155';
    tctx.fillRect(px, py, CELL_PX, CELL_PX);
    tctx.fillStyle = '#475569';
    tctx.fillRect(px, py, CELL_PX, 2);
    tctx.fillStyle = '#1e293b';
    tctx.fillRect(px, py + CELL_PX - 2, CELL_PX, 2);
    tctx.fillStyle = '#64748b';
    tctx.fillRect(px + 2, py + 3, 2, 2);
  }
};

export const BRICK_TILE_SPRITE = {
  draw(tctx, x, y, px, py, val) {
    const palette = BRICK_PALETTES[val] || BRICK_PALETTES[1];

    tctx.fillStyle = palette.base;
    tctx.fillRect(px, py, CELL_PX, CELL_PX);

    tctx.fillStyle = palette.mortar;
    tctx.fillRect(px, py + 3, CELL_PX, 1);
    tctx.fillRect(px + (y % 2 === 0 ? 3 : 6), py, 1, 4);
    tctx.fillRect(px + (y % 2 === 0 ? 6 : 2), py + 4, 1, 4);

    const nEmpty = y > 0 && state.grid[y - 1][x] === 0;
    const sEmpty = y < state.gridH - 1 && state.grid[y + 1][x] === 0;
    const wEmpty = x > 0 && state.grid[y][x - 1] === 0;
    const eEmpty = x < state.gridW - 1 && state.grid[y][x + 1] === 0;

    tctx.fillStyle = palette.light;
    if (nEmpty) tctx.fillRect(px, py, CELL_PX, 2);
    if (wEmpty) tctx.fillRect(px, py, 2, CELL_PX);

    tctx.fillStyle = palette.dark;
    if (sEmpty) tctx.fillRect(px, py + CELL_PX - 2, CELL_PX, 2);
    if (eEmpty) tctx.fillRect(px + CELL_PX - 2, py, 2, CELL_PX);

    if (val <= 2) {
      tctx.fillStyle = '#110b09';
      tctx.fillRect(px + 2, py + 2, 1, 3);
      tctx.fillRect(px + 3, py + 4, 2, 1);
    }
    if (val === 1) {
      tctx.fillStyle = '#090605';
      tctx.fillRect(px + 5, py + 1, 2, 2);
      tctx.fillRect(px + 1, py + 5, 2, 2);
    }
  }
};

export const TERRAIN_SPRITES = {
  empty: EMPTY_TILE_SPRITE,
  steel: STEEL_TILE_SPRITE,
  brick: BRICK_TILE_SPRITE
};

export function drawCellTile(x, y) {
  if (!state.grid) return;
  const val = state.grid[y][x];
  const px = x * CELL_PX;
  const py = y * CELL_PX;

  if (val === 0) {
    TERRAIN_SPRITES.empty.draw(terrainCtx, x, y, px, py, val);
    return;
  }
  if (val === -1) {
    TERRAIN_SPRITES.steel.draw(terrainCtx, x, y, px, py, val);
    return;
  }
  TERRAIN_SPRITES.brick.draw(terrainCtx, x, y, px, py, val);
}

export function rebuildTerrainCanvas() {
  for (let y = 0; y < state.gridH; y++) {
    for (let x = 0; x < state.gridW; x++) {
      drawCellTile(x, y);
    }
  }
}

export function redrawCellsNeighborhood(cells) {
  const seen = new Set();
  for (const c of cells) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= state.gridW || ny >= state.gridH) continue;
        const key = `${nx},${ny}`;
        if (!seen.has(key)) {
          seen.add(key);
          drawCellTile(nx, ny);
        }
      }
    }
  }
}
