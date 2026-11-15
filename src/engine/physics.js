const {
  GRID_W,
  GRID_H,
  TANK_SIZE,
  CELL_EMPTY,
  CELL_STEEL
} = require('../config/constants');

function intersectRayAABB(ox, oy, dx, dy, bx, by, bw, bh) {
  const invDx = dx === 0 ? 1e12 : 1 / dx;
  const invDy = dy === 0 ? 1e12 : 1 / dy;

  const t1 = (bx - ox) * invDx;
  const t2 = (bx + bw - ox) * invDx;
  const t3 = (by - oy) * invDy;
  const t4 = (by + bh - oy) * invDy;

  const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
  const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));

  if (tmax < 0 || tmin > tmax) return null;
  const hitT = tmin >= 0 ? tmin : tmax;
  return hitT > 0.001 ? hitT : null;
}

// Algoritmo Amanatides-Woo DDA para trazar rayos 360° en la micro-cuadrícula
function raycastWallDDA(grid, ox, oy, dx, dy, maxDist = 200) {
  let gx = Math.floor(ox);
  let gy = Math.floor(oy);

  const stepX = dx >= 0 ? 1 : -1;
  const stepY = dy >= 0 ? 1 : -1;

  const tDeltaX = dx === 0 ? 1e12 : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? 1e12 : Math.abs(1 / dy);

  let tMaxX = dx === 0
    ? 1e12
    : (dx > 0 ? (gx + 1 - ox) : (ox - gx)) * tDeltaX;
  let tMaxY = dy === 0
    ? 1e12
    : (dy > 0 ? (gy + 1 - oy) : (oy - gy)) * tDeltaY;

  let t = 0;
  let normalX = 0;
  let normalY = 0;

  for (let iter = 0; iter < 400; iter++) {
    if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) {
      return {
        hit: true,
        t,
        x: ox + dx * t,
        y: oy + dy * t,
        cellX: Math.max(0, Math.min(GRID_W - 1, gx)),
        cellY: Math.max(0, Math.min(GRID_H - 1, gy)),
        normalX,
        normalY,
        cellVal: CELL_STEEL
      };
    }

    const cellVal = grid[gy][gx];
    if (cellVal !== CELL_EMPTY && iter > 0) {
      return {
        hit: true,
        t,
        x: ox + dx * t,
        y: oy + dy * t,
        cellX: gx,
        cellY: gy,
        normalX,
        normalY,
        cellVal
      };
    }

    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += tDeltaX;
      gx += stepX;
      normalX = -stepX;
      normalY = 0;
    } else {
      t = tMaxY;
      tMaxY += tDeltaY;
      gy += stepY;
      normalX = 0;
      normalY = -stepY;
    }

    if (t > maxDist) break;
  }

  return {
    hit: false,
    t: maxDist,
    x: ox + dx * maxDist,
    y: oy + dy * maxDist
  };
}

/**
 * Traza un rayo perforador capaz de atravesar hasta maxWallPierce paredes
 * contiguas de ladrillo (sin límite de espesor de esa pared) y detenerse
 * ante acero o al tocar una pared adicional.
 */
function tracePiercingRay(grid, ox, oy, dx, dy, maxDist = 180, maxWallPierce = 1) {
  let gx = Math.floor(ox);
  let gy = Math.floor(oy);

  const stepX = dx >= 0 ? 1 : -1;
  const stepY = dy >= 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? 1e12 : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? 1e12 : Math.abs(1 / dy);
  let tMaxX = dx === 0 ? 1e12 : (dx > 0 ? (gx + 1 - ox) : (ox - gx)) * tDeltaX;
  let tMaxY = dy === 0 ? 1e12 : (dy > 0 ? (gy + 1 - oy) : (oy - gy)) * tDeltaY;

  let t = 0;
  let wallsPierced = 0;
  let inBrickWall = false;
  let lastBrickImpactT = -1;
  const wallImpacts = [];
  let stopReason = 'range';

  for (let iter = 0; iter < 500; iter++) {
    if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) {
      stopReason = 'steel';
      break;
    }

    const cellVal = grid[gy][gx];
    if (iter > 0) {
      if (cellVal === CELL_STEEL) {
        stopReason = 'steel';
        break;
      }
      if (cellVal === CELL_EMPTY) {
        if (inBrickWall) {
          inBrickWall = false;
          wallImpacts.push({ x: ox + dx * t, y: oy + dy * t, kind: 'exit' });
        }
      } else {
        if (!inBrickWall) {
          if (wallsPierced >= maxWallPierce) {
            wallImpacts.push({ x: ox + dx * t, y: oy + dy * t, kind: 'stop' });
            stopReason = 'wall_limit';
            break;
          }
          wallsPierced++;
          inBrickWall = true;
          lastBrickImpactT = t;
          wallImpacts.push({ x: ox + dx * t, y: oy + dy * t, kind: 'pierce' });
        } else if (t - lastBrickImpactT >= 1.5) {
          lastBrickImpactT = t;
          wallImpacts.push({ x: ox + dx * t, y: oy + dy * t, kind: 'pierce' });
        }
      }
    }

    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += tDeltaX;
      gx += stepX;
    } else {
      t = tMaxY;
      tMaxY += tDeltaY;
      gy += stepY;
    }

    if (t > maxDist) {
      t = maxDist;
      break;
    }
  }

  return {
    finalT: t,
    endX: ox + dx * t,
    endY: oy + dy * t,
    wallsPierced,
    stopReason,
    wallImpacts
  };
}

function findClosestTankHit(tanks, ox, oy, dx, dy, maxDist, ignoreTankId, deployables = []) {
  let best = null;
  for (const tank of tanks) {
    if (!tank.alive || tank.id === ignoreTankId) continue;
    const t = intersectRayAABB(ox, oy, dx, dy, tank.x, tank.y, TANK_SIZE, TANK_SIZE);
    if (t !== null && t <= maxDist && (!best || t < best.t)) {
      best = {
        kind: 'tank',
        tank,
        t,
        x: ox + dx * t,
        y: oy + dy * t
      };
    }
  }
  for (const dep of deployables) {
    if (dep.hp <= 0 || dep.id === ignoreTankId) continue;
    const t = intersectRayAABB(ox, oy, dx, dy, dep.x, dep.y, dep.size, dep.size);
    if (t !== null && t <= maxDist && (!best || t < best.t)) {
      best = {
        kind: 'deployable',
        deployable: dep,
        t,
        x: ox + dx * t,
        y: oy + dy * t
      };
    }
  }
  return best;
}

function findNearestEmptyPoint(grid, tanks, cx, cy, size = 1, maxRadius = 6) {
  const isSpotFree = (sx, sy) => {
    if (sx < 2 || sy < 2 || sx + size > GRID_W - 2 || sy + size > GRID_H - 2) return false;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (grid[sy + dy][sx + dx] !== CELL_EMPTY) return false;
      }
    }
    for (const t of tanks) {
      if (!t.alive) continue;
      if (sx < t.x + TANK_SIZE && sx + size > t.x && sy < t.y + TANK_SIZE && sy + size > t.y) {
        return false;
      }
    }
    return true;
  };

  const bx = Math.floor(cx - size / 2);
  const by = Math.floor(cy - size / 2);
  if (isSpotFree(bx, by)) return { x: bx, y: by };

  let best = null;
  let bestD = 1e9;
  for (let r = 1; r <= maxRadius; r++) {
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        const sx = bx + ox;
        const sy = by + oy;
        if (!isSpotFree(sx, sy)) continue;
        const d = ox * ox + oy * oy;
        if (d < bestD) {
          bestD = d;
          best = { x: sx, y: sy };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

function applyRadialWallDamage(grid, cx, cy, radius, maxDamage, falloff = 0.75) {
  const changed = [];
  const rCeil = Math.ceil(radius);
  const minX = Math.max(2, Math.floor(cx - rCeil));
  const maxX = Math.min(GRID_W - 3, Math.ceil(cx + rCeil));
  const minY = Math.max(2, Math.floor(cy - rCeil));
  const maxY = Math.min(GRID_H - 3, Math.ceil(cy + rCeil));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const val = grid[y][x];
      if (val <= 0) continue;
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (dist > radius) continue;

      const rawDmg = maxDamage - dist * falloff;
      const dmg = Math.max(1, Math.round(rawDmg));
      const nextVal = Math.max(0, val - dmg);
      if (nextVal !== val) {
        grid[y][x] = nextVal;
        changed.push({ x, y, hp: nextVal });
      }
    }
  }
  return changed;
}

function computeOutgoingDamage(shooter, baseDamage) {
  if (!shooter || shooter.passive !== 'berserk' || !(shooter.maxHp > 0)) {
    return baseDamage;
  }
  const missingRatio = Math.max(0, (shooter.maxHp - shooter.hp) / shooter.maxHp);
  return Math.max(1, Math.round(baseDamage * (1 + missingRatio)));
}

function applyTankDamage(tank, rawDamage) {
  if (!tank || !tank.alive || rawDamage <= 0) return 0;
  let finalDmg = rawDamage;
  if (tank.rageActive) {
    const red = tank.rageDamageReduction ?? 0.9;
    finalDmg = Math.max(1, Math.round(rawDamage * (1 - red)));
  }
  if (tank.tpShieldActive) {
    const red = tank.tpShieldReduction ?? 0.35;
    finalDmg = Math.max(1, Math.round(finalDmg * (1 - red)));
  }
  tank.hp = Math.max(0, tank.hp - finalDmg);
  if (tank.hp === 0) tank.alive = false;
  return finalDmg;
}

/**
 * Classifies where a shot hit `target` relative to its chassis facing (`target.dir`, last movement).
 * Only the two wheel-less front/rear panels (|sideDot| <= |forwardDot| * 0.75) count as front/back;
 * the two wheeled flanks count as 'side'.
 */
function classifyHitSectorByDir(target, hx, hy) {
  if (!target) return 'side';
  const cx = target.x + 2;
  const cy = target.y + 2;
  const dx = hx - cx;
  const dy = hy - cy;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-6) return 'side';
  const angle = Number.isFinite(target.dir) ? target.dir : 0;
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  const forwardDot = dx * fx + dy * fy;
  const sideDot = dx * (-fy) + dy * fx;
  if (Math.abs(sideDot) <= Math.abs(forwardDot) * 0.75) {
    return forwardDot < 0 ? 'back' : 'front';
  }
  return 'side';
}

function applyRadialTankDamage(tanks, cx, cy, radius, maxDamage, minDamage = 10, deployables = []) {
  const hits = [];
  for (const tank of tanks) {
    if (!tank.alive) continue;
    const nearestX = Math.max(tank.x, Math.min(cx, tank.x + TANK_SIZE));
    const nearestY = Math.max(tank.y, Math.min(cy, tank.y + TANK_SIZE));
    const dist = Math.hypot(nearestX - cx, nearestY - cy);
    if (dist <= radius) {
      const ratio = 1 - dist / (radius + 0.001);
      const rawDmg = Math.max(minDamage, Math.round(maxDamage * (0.4 + 0.6 * ratio)));
      const dmg = applyTankDamage(tank, rawDmg);
      hits.push({
        tankId: tank.id,
        tankName: tank.name,
        damage: dmg,
        remainingHp: tank.hp,
        destroyed: !tank.alive,
        x: tank.x + TANK_SIZE / 2,
        y: tank.y + TANK_SIZE / 2
      });
    }
  }
  for (const dep of deployables) {
    if (dep.hp <= 0) continue;
    const nearestX = Math.max(dep.x, Math.min(cx, dep.x + dep.size));
    const nearestY = Math.max(dep.y, Math.min(cy, dep.y + dep.size));
    const dist = Math.hypot(nearestX - cx, nearestY - cy);
    if (dist <= radius) {
      dep.hp = Math.max(0, dep.hp - 1);
      hits.push({
        tankId: dep.id,
        tankName: dep.name,
        damage: 1,
        remainingHp: dep.hp,
        destroyed: dep.hp === 0,
        x: dep.x + dep.size / 2,
        y: dep.y + dep.size / 2
      });
    }
  }
  return hits;
}

function buildWallBarricade(grid, tanks, cx, cy, angle, length, thickness, wallHp) {
  const changed = [];
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  const px = -fy;
  const py = fx;
  const reach = Math.ceil(length / 2 + thickness + 1);
  const minX = Math.max(2, Math.floor(cx - reach));
  const maxX = Math.min(GRID_W - 3, Math.ceil(cx + reach));
  const minY = Math.max(2, Math.floor(cy - reach));
  const maxY = Math.min(GRID_H - 3, Math.ceil(cy + reach));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (grid[y][x] === CELL_STEEL) continue;

      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const u = dx * px + dy * py;
      const v = dx * fx + dy * fy;
      if (Math.abs(u) > length / 2 || Math.abs(v) > thickness / 2) continue;

      let overlapsTank = false;
      for (const t of tanks) {
        if (!t.alive) continue;
        if (x >= t.x && x < t.x + TANK_SIZE && y >= t.y && y < t.y + TANK_SIZE) {
          overlapsTank = true;
          break;
        }
      }
      if (overlapsTank) continue;

      if (grid[y][x] < wallHp) {
        grid[y][x] = wallHp;
        changed.push({ x, y, hp: wallHp });
      }
    }
  }
  return changed;
}

function hasLineOfSightToEntity(grid, tanks, shooter, target, deployables = []) {
  if (!shooter || !target) return false;
  const sSize = shooter.size || TANK_SIZE;
  const tSize = target.size || TANK_SIZE;
  const ox = shooter.x + sSize / 2;
  const oy = shooter.y + sSize / 2;
  const tx = target.x + tSize / 2;
  const ty = target.y + tSize / 2;
  const angle = Math.atan2(ty - oy, tx - ox);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const wallHit = raycastWallDDA(grid, ox, oy, dx, dy, 180);
  const hit = findClosestTankHit(tanks, ox, oy, dx, dy, wallHit.t, shooter.id, deployables);
  if (!hit) return false;
  return hit.kind === 'tank' ? hit.tank.id === target.id : hit.deployable.id === target.id;
}

function hasLineOfSightToTank(grid, tanks, shooter, target, deployables = []) {
  return hasLineOfSightToEntity(grid, tanks, shooter, target, deployables);
}

function isTankExposedToObserverAt(grid, tanks, observer, targetTankId, posX, posY, deployables = []) {
  if (!observer) return false;
  const oSize = observer.size || TANK_SIZE;
  const ox = observer.x + oSize / 2;
  const oy = observer.y + oSize / 2;

  const samplePoints = [
    { x: posX + TANK_SIZE / 2, y: posY + TANK_SIZE / 2 },
    { x: posX + 0.5, y: posY + 0.5 },
    { x: posX + TANK_SIZE - 0.5, y: posY + 0.5 },
    { x: posX + 0.5, y: posY + TANK_SIZE - 0.5 },
    { x: posX + TANK_SIZE - 0.5, y: posY + TANK_SIZE - 0.5 }
  ];

  for (const pt of samplePoints) {
    const dxRaw = pt.x - ox;
    const dyRaw = pt.y - oy;
    const dist = Math.hypot(dxRaw, dyRaw);
    if (dist < 0.01) return true;
    const dx = dxRaw / dist;
    const dy = dyRaw / dist;
    const wallHit = raycastWallDDA(grid, ox, oy, dx, dy, Math.min(180, dist + 1));
    if (wallHit.t + 0.05 >= dist) {
      // Comprobar que no haya otro tanque/desplegable tapando el rayo
      const otherHit = findClosestTankHit(
        tanks.filter((t) => t.id !== targetTankId),
        ox,
        oy,
        dx,
        dy,
        dist,
        observer.id,
        deployables
      );
      if (!otherHit) return true;
    }
  }
  return false;
}

module.exports = {
  intersectRayAABB,
  raycastWallDDA,
  tracePiercingRay,
  findClosestTankHit,
  findNearestEmptyPoint,
  computeOutgoingDamage,
  applyTankDamage,
  classifyHitSectorByDir,
  applyRadialWallDamage,
  applyRadialTankDamage,
  buildWallBarricade,
  hasLineOfSightToEntity,
  hasLineOfSightToTank,
  isTankExposedToObserverAt
};
