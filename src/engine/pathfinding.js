const { GRID_W, GRID_H, TANK_SIZE, CELL_EMPTY } = require('../config/constants');

function isFootprintFree(grid, tx, ty, tanks, ignoreTankId = null, entitySize = TANK_SIZE) {
  if (tx < 2 || ty < 2 || tx + entitySize > GRID_W - 2 || ty + entitySize > GRID_H - 2) {
    return false;
  }
  for (let dy = 0; dy < entitySize; dy++) {
    const row = grid[ty + dy];
    for (let dx = 0; dx < entitySize; dx++) {
      if (row[tx + dx] !== CELL_EMPTY) return false;
    }
  }
  for (const other of tanks) {
    if (!other.alive || other.id === ignoreTankId) continue;
    const overlapX = tx < other.x + TANK_SIZE && tx + entitySize > other.x;
    const overlapY = ty < other.y + TANK_SIZE && ty + entitySize > other.y;
    if (overlapX && overlapY) return false;
  }
  return true;
}

function buildWalkableGrid(grid, tanks, ignoreTankId, entitySize = TANK_SIZE) {
  const walkable = Array.from({ length: GRID_H }, () => new Uint8Array(GRID_W));
  for (let y = 2; y <= GRID_H - 2 - entitySize; y++) {
    for (let x = 2; x <= GRID_W - 2 - entitySize; x++) {
      if (isFootprintFree(grid, x, y, tanks, ignoreTankId, entitySize)) {
        walkable[y][x] = 1;
      }
    }
  }
  return walkable;
}

function findPathAStar(walkable, sx, sy, gx, gy, maxNodes = 6000) {
  if (sx === gx && sy === gy) return [];
  if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H || !walkable[gy][gx]) {
    return null;
  }

  const total = GRID_W * GRID_H;
  const gScore = new Int32Array(total).fill(1e9);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);

  const startIdx = sy * GRID_W + sx;
  const goalIdx = gy * GRID_W + gx;
  gScore[startIdx] = 0;

  const heap = [{ idx: startIdx, f: Math.abs(gx - sx) + Math.abs(gy - sy) }];
  const pushHeap = (node) => {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const popHeap = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      const len = heap.length;
      while (true) {
        let best = i;
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        if (l < len && heap[l].f < heap[best].f) best = l;
        if (r < len && heap[r].f < heap[best].f) best = r;
        if (best === i) break;
        [heap[i], heap[best]] = [heap[best], heap[i]];
        i = best;
      }
    }
    return top;
  };

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  let expanded = 0;

  while (heap.length > 0 && expanded < maxNodes) {
    const cur = popHeap();
    if (closed[cur.idx]) continue;
    closed[cur.idx] = 1;
    expanded++;

    if (cur.idx === goalIdx) {
      const pathCoords = [];
      let p = goalIdx;
      while (p !== startIdx && p !== -1) {
        pathCoords.push({ x: p % GRID_W, y: Math.floor(p / GRID_W) });
        p = cameFrom[p];
      }
      pathCoords.reverse();
      return pathCoords;
    }

    const cx = cur.idx % GRID_W;
    const cy = Math.floor(cur.idx / GRID_W);
    const curG = gScore[cur.idx];

    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      if (!walkable[ny][nx]) continue;
      const nIdx = ny * GRID_W + nx;
      if (closed[nIdx]) continue;
      const tentativeG = curG + 1;
      if (tentativeG < gScore[nIdx]) {
        gScore[nIdx] = tentativeG;
        cameFrom[nIdx] = cur.idx;
        const h = Math.abs(gx - nx) + Math.abs(gy - ny);
        pushHeap({ idx: nIdx, f: tentativeG + h });
      }
    }
  }
  return null;
}

module.exports = {
  isFootprintFree,
  buildWalkableGrid,
  findPathAStar
};
