const {
  GRID_W,
  GRID_H,
  TANK_SIZE,
  CELL_EMPTY,
  CELL_STEEL,
  BRICK_MAX_HP
} = require('../config/constants');

const SPAWN_POINTS = [
  { x: 8, y: 34 },
  { x: 108, y: 34 },
  { x: 108, y: 12 },
  { x: 108, y: 56 },
  { x: 84, y: 8 }
];

function createSeededRng(seed) {
  let a = (Number(seed) || 1) >>> 0;
  if (a === 0) a = 0x6d2b79f5;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

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

function clearSpawnZones(grid) {
  for (const sp of SPAWN_POINTS) {
    paintRect(grid, sp.x - 4, sp.y - 4, TANK_SIZE + 8, TANK_SIZE + 8, CELL_EMPTY);
  }
}

function isAreaWalkable(grid, x0, y0) {
  if (x0 < 2 || y0 < 2 || x0 > GRID_W - 2 - TANK_SIZE || y0 > GRID_H - 2 - TANK_SIZE) {
    return false;
  }
  for (let dy = 0; dy < TANK_SIZE; dy++) {
    for (let dx = 0; dx < TANK_SIZE; dx++) {
      if (grid[y0 + dy][x0 + dx] !== CELL_EMPTY) return false;
    }
  }
  return true;
}

function getReachableMask(grid, startX, startY) {
  const visited = new Uint8Array(GRID_W * GRID_H);
  const queue = [];
  if (!isAreaWalkable(grid, startX, startY)) return visited;
  visited[startY * GRID_W + startX] = 1;
  queue.push(startX, startY);

  let head = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (head < queue.length) {
    const cx = queue[head++];
    const cy = queue[head++];
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 2 || ny < 2 || nx > GRID_W - 2 - TANK_SIZE || ny > GRID_H - 2 - TANK_SIZE) continue;
      const idx = ny * GRID_W + nx;
      if (visited[idx]) continue;
      if (isAreaWalkable(grid, nx, ny)) {
        visited[idx] = 1;
        queue.push(nx, ny);
      }
    }
  }
  return visited;
}

function carveCorridorBetween(grid, ax, ay, bx, by) {
  let x = ax;
  let y = ay;
  while (x !== bx) {
    paintRect(grid, x - 1, y - 1, TANK_SIZE + 2, TANK_SIZE + 2, CELL_EMPTY);
    x += Math.sign(bx - x);
  }
  while (y !== by) {
    paintRect(grid, x - 1, y - 1, TANK_SIZE + 2, TANK_SIZE + 2, CELL_EMPTY);
    y += Math.sign(by - y);
  }
  paintRect(grid, bx - 1, by - 1, TANK_SIZE + 2, TANK_SIZE + 2, CELL_EMPTY);
}

function ensureSpawnConnectivity(grid) {
  const origin = SPAWN_POINTS[0];
  let reachable = getReachableMask(grid, origin.x, origin.y);
  for (let i = 1; i < SPAWN_POINTS.length; i++) {
    const sp = SPAWN_POINTS[i];
    if (!reachable[sp.y * GRID_W + sp.x]) {
      carveCorridorBetween(grid, origin.x, origin.y, sp.x, sp.y);
      reachable = getReachableMask(grid, origin.x, origin.y);
    }
  }
}

function generateRandomArena(grid, seed) {
  const rng = createSeededRng(seed);
  const brickBlocks = randInt(rng, 22, 40);
  const steelPillars = randInt(rng, 3, 9);
  const hollowRooms = randInt(rng, 2, 6);

  // 1. Hollow tactical bunkers / ruins carved from 0 with random doorways
  for (let i = 0; i < hollowRooms; i++) {
    const w = randInt(rng, 10, 18);
    const h = randInt(rng, 9, 15);
    const x = randInt(rng, 16, GRID_W - 18 - w);
    const y = randInt(rng, 5, GRID_H - 7 - h);
    const wallThick = randInt(rng, 2, 3);
    const mat = rng() < 0.2 ? CELL_STEEL : BRICK_MAX_HP;

    paintRect(grid, x, y, w, h, mat);
    paintRect(grid, x + wallThick, y + wallThick, w - wallThick * 2, h - wallThick * 2, CELL_EMPTY);
    // Open two opposite or perpendicular doorways (5+ cells wide so tanks pass freely)
    paintRect(grid, x + Math.floor(w / 2) - 2, y, 5, h, CELL_EMPTY);
    if (rng() < 0.7) {
      paintRect(grid, x, y + Math.floor(h / 2) - 2, w, 5, CELL_EMPTY);
    }
  }

  // 2. Random destructible brick walls, trenches & L-shaped covers
  for (let i = 0; i < brickBlocks; i++) {
    const x = randInt(rng, 14, GRID_W - 22);
    const y = randInt(rng, 4, GRID_H - 12);
    const w = randInt(rng, 3, 12);
    const h = randInt(rng, 3, 12);
    paintRect(grid, x, y, w, h, BRICK_MAX_HP);

    if (rng() < 0.45) {
      const armW = randInt(rng, 3, 9);
      const armH = randInt(rng, 3, 9);
      const ox = rng() < 0.5 ? x + w - 2 : Math.max(12, x - armW + 2);
      const oy = rng() < 0.5 ? y + h - 2 : Math.max(4, y - armH + 2);
      paintRect(grid, ox, oy, armW, armH, BRICK_MAX_HP);
    }
  }

  // 3. Random indestructible steel pillars for hard tactical cover
  for (let i = 0; i < steelPillars; i++) {
    const w = randInt(rng, 2, 5);
    const h = randInt(rng, 2, 6);
    const x = randInt(rng, 18, GRID_W - 20 - w);
    const y = randInt(rng, 6, GRID_H - 8 - h);
    paintRect(grid, x, y, w, h, CELL_STEEL);
  }

  // 4. Random scatter breaches so maps never become excessively solid walls
  const breaches = randInt(rng, 4, 10);
  for (let i = 0; i < breaches; i++) {
    const bw = randInt(rng, 5, 9);
    const bh = randInt(rng, 5, 9);
    const bx = randInt(rng, 14, GRID_W - 16 - bw);
    const by = randInt(rng, 4, GRID_H - 6 - bh);
    paintRect(grid, bx, by, bw, bh, CELL_EMPTY);
  }

  clearSpawnZones(grid);
  ensureSpawnConnectivity(grid);
}

function generateArena(mapStyle = 'bunkers', mapSeed = null) {
  const grid = createEmptyGrid();

  if (mapStyle === 'random') {
    const seed = Number.isFinite(Number(mapSeed)) && Number(mapSeed) > 0
      ? (Number(mapSeed) >>> 0)
      : ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
    generateRandomArena(grid, seed);
    return grid;
  }

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
  createSeededRng,
  createEmptyGrid,
  paintRect,
  generateArena
};
