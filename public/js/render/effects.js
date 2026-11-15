import { CELL_PX } from '../constants.js';
import { state } from '../state.js';
import { PARTICLE_PALETTES, TRACE_COLORS, SPECIAL2_PREVIEW_COLORS } from '../assets/palettes.js';

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

/** Traces a 360-degree ray on the client grid using Amanatides-Woo DDA. */
function raycastWallClient(ox, oy, dx, dy, maxDist = 180) {
  const grid = state.grid;
  const gridW = state.gridW;
  const gridH = state.gridH;
  if (!grid || !gridH || !gridW) {
    return { hit: false, t: maxDist, x: ox + dx * maxDist, y: oy + dy * maxDist };
  }

  let gx = Math.floor(ox);
  let gy = Math.floor(oy);

  const stepX = dx >= 0 ? 1 : -1;
  const stepY = dy >= 0 ? 1 : -1;

  const tDeltaX = dx === 0 ? 1e12 : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? 1e12 : Math.abs(1 / dy);

  let tMaxX = dx === 0 ? 1e12 : (dx > 0 ? (gx + 1 - ox) : (ox - gx)) * tDeltaX;
  let tMaxY = dy === 0 ? 1e12 : (dy > 0 ? (gy + 1 - oy) : (oy - gy)) * tDeltaY;

  let t = 0;
  let normalX = 0;
  let normalY = 0;

  for (let iter = 0; iter < 400; iter++) {
    if (gx < 0 || gy < 0 || gx >= gridW || gy >= gridH) {
      return {
        hit: true,
        t,
        x: ox + dx * t,
        y: oy + dy * t,
        cellX: Math.max(0, Math.min(gridW - 1, gx)),
        cellY: Math.max(0, Math.min(gridH - 1, gy)),
        normalX,
        normalY,
        cellVal: -1
      };
    }

    const cellVal = grid[gy][gx];
    if (cellVal !== 0 && iter > 0) {
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

/** Finds the closest alive tank or deployable hit by a ray before maxDist. */
function findClosestEntityHit(ox, oy, dx, dy, maxDist, ignoreId) {
  let best = null;
  for (const tank of state.tanks || []) {
    if (!tank.alive || tank.id === ignoreId) continue;
    const t = intersectRayAABB(ox, oy, dx, dy, tank.x, tank.y, state.tankSize, state.tankSize);
    if (t !== null && t <= maxDist && (!best || t < best.t)) {
      best = { kind: 'tank', t, x: ox + dx * t, y: oy + dy * t };
    }
  }
  for (const dep of state.deployables || []) {
    if (dep.hp <= 0 || dep.id === ignoreId) continue;
    const size = dep.size || 2;
    const t = intersectRayAABB(ox, oy, dx, dy, dep.x, dep.y, size, size);
    if (t !== null && t <= maxDist && (!best || t < best.t)) {
      best = { kind: 'deployable', t, x: ox + dx * t, y: oy + dy * t };
    }
  }
  return best;
}

/** Resolves direct-fire projectile impact point against walls and entities. */
function traceDirectShotRay(ox, oy, angle, maxDist, ignoreId) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const wallHit = raycastWallClient(ox, oy, dx, dy, maxDist);
  const entityHit = findClosestEntityHit(ox, oy, dx, dy, wallHit.t, ignoreId);

  if (entityHit) {
    return {
      hitKind: 'entity',
      t: entityHit.t,
      x: entityHit.x,
      y: entityHit.y,
      isInteriorWall: false,
      normalX: 0,
      normalY: 0,
      cellVal: 0
    };
  }

  const isInteriorWall =
    wallHit.hit &&
    wallHit.cellX > 0 &&
    wallHit.cellX < state.gridW - 1 &&
    wallHit.cellY > 0 &&
    wallHit.cellY < state.gridH - 1;

  return {
    hitKind: wallHit.hit ? 'wall' : 'none',
    t: wallHit.t,
    x: wallHit.x,
    y: wallHit.y,
    isInteriorWall,
    normalX: wallHit.normalX || 0,
    normalY: wallHit.normalY || 0,
    cellVal: wallHit.cellVal || 0
  };
}

function drawWallImpactMarker(ctx, xPx, yPx, color) {
  const r = 3.5;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(xPx - r, yPx - r);
  ctx.lineTo(xPx + r, yPx + r);
  ctx.moveTo(xPx + r, yPx - r);
  ctx.lineTo(xPx - r, yPx + r);
  ctx.stroke();
  ctx.restore();
}

function drawTargetHitMarker(ctx, xPx, yPx, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(xPx, yPx, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function spawnExplosionParticles(gx, gy, radius, kind) {
  const px = gx * CELL_PX;
  const py = gy * CELL_PX;
  const count = Math.round(10 + radius * 4);
  const colors = PARTICLE_PALETTES[kind] || PARTICLE_PALETTES.default;

  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 25 + Math.random() * (45 + radius * 18);
    state.particles.push({
      x: px,
      y: py,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      size: Math.random() < 0.5 ? 3 : 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 0.35 + Math.random() * 0.35
    });
  }
}

function drawShotgunReticle(ctx, ox, oy, angle, pellets, spreadDeg, rangeGrid, color, ignoreId) {
  const half = ((spreadDeg * Math.PI) / 180) / 2;
  const px = ox * CELL_PX;
  const py = oy * CELL_PX;

  for (let i = 0; i < pellets; i++) {
    const offset = pellets === 1 ? 0 : -half + (i / (pellets - 1)) * half * 2;
    const a = angle + offset;
    const hit = traceDirectShotRay(ox, oy, a, rangeGrid, ignoreId);
    const ex = hit.x * CELL_PX;
    const ey = hit.y * CELL_PX;

    ctx.strokeStyle = hit.hitKind === 'wall' ? 'rgba(248, 113, 113, 0.78)' : color;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    if (hit.hitKind === 'wall') {
      drawWallImpactMarker(ctx, ex, ey, 'rgba(248, 113, 113, 0.9)');
    } else if (hit.hitKind === 'entity') {
      drawTargetHitMarker(ctx, ex, ey, 'rgba(52, 211, 153, 0.9)');
    }
  }
}

function drawDirectBeamPreview(ctx, ox, oy, angle, ignoreId, { baseColor, wallColor, hitColor, lineWidth = 1.5, dash = [5, 5] }) {
  const hit = traceDirectShotRay(ox, oy, angle, 180, ignoreId);
  const px = ox * CELL_PX;
  const py = oy * CELL_PX;
  const ex = hit.x * CELL_PX;
  const ey = hit.y * CELL_PX;
  const mouseDist = Math.hypot(state.mouseGrid.x - ox, state.mouseGrid.y - oy);
  const wallBlockedView = hit.hitKind === 'wall' && (hit.isInteriorWall || hit.t < mouseDist - 0.5);

  ctx.strokeStyle = hit.hitKind === 'entity'
    ? hitColor
    : wallBlockedView
      ? wallColor
      : baseColor;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  if (hit.hitKind === 'entity') {
    drawTargetHitMarker(ctx, ex, ey, hitColor);
  } else if (wallBlockedView) {
    drawWallImpactMarker(ctx, ex, ey, wallColor);
  }
}

function drawRicochetPreview(ctx, ox, oy, angle, ignoreId, bounces) {
  let curX = ox;
  let curY = oy;
  let dx = Math.cos(angle);
  let dy = Math.sin(angle);
  let ign = ignoreId;

  ctx.strokeStyle = 'rgba(34, 211, 238, 0.75)';
  ctx.lineWidth = 1.8;

  for (let b = 0; b <= bounces; b++) {
    const wallHit = raycastWallClient(curX, curY, dx, dy, 160);
    const entityHit = findClosestEntityHit(curX, curY, dx, dy, wallHit.t, ign);

    if (entityHit) {
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(curX * CELL_PX, curY * CELL_PX);
      ctx.lineTo(entityHit.x * CELL_PX, entityHit.y * CELL_PX);
      ctx.stroke();
      drawTargetHitMarker(ctx, entityHit.x * CELL_PX, entityHit.y * CELL_PX, 'rgba(52, 211, 153, 0.95)');
      break;
    }

    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(curX * CELL_PX, curY * CELL_PX);
    ctx.lineTo(wallHit.x * CELL_PX, wallHit.y * CELL_PX);
    ctx.stroke();

    if (!wallHit.hit || b === bounces) {
      if (wallHit.hit) {
        drawWallImpactMarker(ctx, wallHit.x * CELL_PX, wallHit.y * CELL_PX, 'rgba(248, 113, 113, 0.85)');
      }
      break;
    }

    drawTargetHitMarker(ctx, wallHit.x * CELL_PX, wallHit.y * CELL_PX, 'rgba(34, 211, 238, 0.85)');
    if (wallHit.normalX !== 0) dx = -dx;
    if (wallHit.normalY !== 0) dy = -dy;
    curX = wallHit.x + wallHit.normalX * 0.08;
    curY = wallHit.y + wallHit.normalY * 0.08;
    ign = null;
  }
}

function drawPiercingPreview(ctx, ox, oy, angle, ignoreId, piercePower) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let curX = ox;
  let curY = oy;
  let power = piercePower;
  let endX = ox;
  let endY = oy;
  let hitSteel = false;

  for (let step = 0; step < 30 && power > 0; step++) {
    const wallHit = raycastWallClient(curX, curY, dx, dy, 170);
    endX = wallHit.x;
    endY = wallHit.y;
    if (!wallHit.hit || wallHit.cellVal === -1) {
      hitSteel = wallHit.cellVal === -1;
      break;
    }
    power--;
    curX = wallHit.x + dx * 0.9;
    curY = wallHit.y + dy * 0.9;
    if (curX < 1 || curX >= state.gridW - 1 || curY < 1 || curY >= state.gridH - 1) break;
  }

  ctx.strokeStyle = 'rgba(167, 139, 250, 0.82)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(ox * CELL_PX, oy * CELL_PX);
  ctx.lineTo(endX * CELL_PX, endY * CELL_PX);
  ctx.stroke();

  if (hitSteel) {
    drawWallImpactMarker(ctx, endX * CELL_PX, endY * CELL_PX, 'rgba(248, 113, 113, 0.85)');
  }
}

export function drawAimPreview(ctx, player, playerDrone, usingDrone) {
  const aimUnit = usingDrone ? playerDrone : player;
  if (!player || !player.alive || state.phase !== 'player' || !aimUnit || !aimUnit.canShoot || state.clickMode !== 'shoot') {
    return;
  }

  const vt = usingDrone ? null : state.visualTanks.get(player.id);
  const aimSize = usingDrone ? playerDrone.size : state.tankSize;
  const ox = (vt ? vt.x : aimUnit.x) + aimSize / 2;
  const oy = (vt ? vt.y : aimUnit.y) + aimSize / 2;
  const px = ox * CELL_PX;
  const py = oy * CELL_PX;
  const angle = vt ? vt.aimAngle : aimUnit.aimAngle;

  ctx.save();
  if (state.weaponMode === 'normal' && !usingDrone && player.basicWeapon === 'short_shotgun') {
    drawShotgunReticle(ctx, ox, oy, angle, 4, 28, 22, 'rgba(0, 212, 255, 0.72)', aimUnit.id);
  } else if (!usingDrone && state.weaponMode === 'special' && player.turretId === 'mortar' && player.specialCooldown === 0) {
    const maxR = state.catalog.turrets.mortar.range;
    const dist = Math.min(maxR, Math.max(6, Math.hypot(state.mouseGrid.x - ox, state.mouseGrid.y - oy)));
    const tx = (ox + Math.cos(angle) * dist) * CELL_PX;
    const ty = (oy + Math.sin(angle) * dist) * CELL_PX;
    const radPx = state.catalog.turrets.mortar.specialRadius * CELL_PX;

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.16)';
    ctx.beginPath();
    ctx.arc(tx, ty, radPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (!usingDrone && state.weaponMode === 'special' && player.turretId === 'shotgun' && player.specialCooldown === 0) {
    const tu = state.catalog.turrets.shotgun;
    drawShotgunReticle(ctx, ox, oy, angle, tu.pellets, tu.spreadDeg, 46, 'rgba(251, 146, 60, 0.65)', aimUnit.id);
  } else if (!usingDrone && state.weaponMode === 'special' && player.turretId === 'bloodsucker' && player.specialCooldown === 0) {
    const tu = state.catalog.turrets.bloodsucker;
    drawShotgunReticle(ctx, ox, oy, angle, tu.pellets, tu.spreadDeg, tu.range, 'rgba(225, 29, 72, 0.8)', aimUnit.id);
  } else if (!usingDrone && state.weaponMode === 'special' && player.turretId === 'ricochet' && player.specialCooldown === 0) {
    const tu = state.catalog.turrets.ricochet;
    drawRicochetPreview(ctx, ox, oy, angle, aimUnit.id, tu.bounces);
  } else if (!usingDrone && state.weaponMode === 'special' && player.turretId === 'piercing' && player.specialCooldown === 0) {
    const tu = state.catalog.turrets.piercing;
    drawPiercingPreview(ctx, ox, oy, angle, aimUnit.id, tu.piercePower);
  } else if (!usingDrone && state.weaponMode === 'special' && player.turretId === 'builder' && player.specialCooldown === 0) {
    const tu = state.catalog.turrets.builder;
    const dist = Math.min(tu.range, Math.max(6, Math.hypot(state.mouseGrid.x - ox, state.mouseGrid.y - oy)));
    const tx = (ox + Math.cos(angle) * dist) * CELL_PX;
    const ty = (oy + Math.sin(angle) * dist) * CELL_PX;
    const wPx = tu.wallThickness * CELL_PX;
    const hPx = tu.wallLength * CELL_PX;

    ctx.strokeStyle = 'rgba(45, 212, 191, 0.8)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(angle);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(45, 212, 191, 0.22)';
    ctx.fillRect(-wPx / 2, -hPx / 2, wPx, hPx);
    ctx.strokeRect(-wPx / 2, -hPx / 2, wPx, hPx);
    ctx.restore();
  } else if (!usingDrone && state.weaponMode === 'special' && (player.turretId === 'toxic' || player.turretId === 'fire_shot') && player.specialCooldown === 0) {
    const tu = state.catalog.turrets[player.turretId];
    const reqDist = Math.min(tu.range, Math.max(4, Math.hypot(state.mouseGrid.x - ox, state.mouseGrid.y - oy)));
    const directHit = traceDirectShotRay(ox, oy, angle, 180, aimUnit.id);
    const blockedAt = directHit.hitKind === 'entity'
      ? directHit.t
      : directHit.hitKind === 'wall'
        ? Math.max(1, directHit.t - 0.35)
        : tu.range;
    const dist = Math.min(reqDist, blockedAt);
    const blockedByWall = directHit.hitKind === 'wall' && blockedAt < reqDist - 0.1;
    const tx = (ox + Math.cos(angle) * dist) * CELL_PX;
    const ty = (oy + Math.sin(angle) * dist) * CELL_PX;
    const baseCol = player.turretId === 'fire_shot' ? 'rgba(239, 68, 68, 0.85)' : 'rgba(163, 230, 53, 0.8)';

    ctx.strokeStyle = blockedByWall ? 'rgba(248, 113, 113, 0.85)' : baseCol;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(tx, ty, tu.puddleRadius * CELL_PX, 0, Math.PI * 2);
    ctx.stroke();
    if (blockedByWall) {
      drawWallImpactMarker(ctx, directHit.x * CELL_PX, directHit.y * CELL_PX, 'rgba(248, 113, 113, 0.92)');
    }
  } else if (!usingDrone && state.weaponMode === 'special' && player.turretId === 'drone' && player.specialCooldown === 0) {
    const tu = state.catalog.turrets.drone;
    const dist = Math.min(tu.range, Math.max(4, Math.hypot(state.mouseGrid.x - ox, state.mouseGrid.y - oy)));
    const tx = (ox + Math.cos(angle) * dist) * CELL_PX;
    const ty = (oy + Math.sin(angle) * dist) * CELL_PX;
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.85)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeRect(tx - CELL_PX, ty - CELL_PX, CELL_PX * 2, CELL_PX * 2);
  } else if (
    state.weaponMode === 'special2' &&
    aimUnit.special2Id &&
    (usingDrone ? (aimUnit.droneSpecial2Cooldown || 0) === 0 : (player.special2Cooldown === 0 || player.chargedReady))
  ) {
    const sp2 = state.catalog.specials2[aimUnit.special2Id];
    if (sp2.id === 'charged_shot' || sp2.id === 'freeze_shot') {
      const baseColor = sp2.id === 'freeze_shot'
        ? 'rgba(103, 232, 249, 0.85)'
        : player.chargedReady ? 'rgba(34, 211, 238, 0.85)' : 'rgba(56, 189, 248, 0.45)';
      drawDirectBeamPreview(ctx, ox, oy, angle, aimUnit.id, {
        baseColor,
        wallColor: 'rgba(248, 113, 113, 0.85)',
        hitColor: 'rgba(52, 211, 153, 0.92)',
        lineWidth: player.chargedReady || sp2.id === 'freeze_shot' ? 2.5 : 1.5,
        dash: player.chargedReady ? [] : [4, 4]
      });
    } else if (sp2.id === 'fire_wall') {
      const dist = Math.min(sp2.range, Math.max(5, Math.hypot(state.mouseGrid.x - ox, state.mouseGrid.y - oy)));
      const tx = (ox + Math.cos(angle) * dist) * CELL_PX;
      const ty = (oy + Math.sin(angle) * dist) * CELL_PX;
      const wPx = sp2.wallThickness * CELL_PX;
      const hPx = sp2.wallLength * CELL_PX;
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(angle);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.fillRect(-wPx / 2, -hPx / 2, wPx, hPx);
      ctx.strokeRect(-wPx / 2, -hPx / 2, wPx, hPx);
      ctx.restore();
    } else {
      const dist = Math.min(sp2.range, Math.max(5, Math.hypot(state.mouseGrid.x - ox, state.mouseGrid.y - oy)));
      const tx = (ox + Math.cos(angle) * dist) * CELL_PX;
      const ty = (oy + Math.sin(angle) * dist) * CELL_PX;
      const radPx = (sp2.blastRadius || sp2.radius || sp2.triggerRadius || 2.0) * CELL_PX;
      ctx.strokeStyle = SPECIAL2_PREVIEW_COLORS[sp2.id] || SPECIAL2_PREVIEW_COLORS.default;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      ctx.setLineDash([]);
      if (sp2.id === 'auto_turret') {
        ctx.strokeRect(tx - CELL_PX, ty - CELL_PX, CELL_PX * 2, CELL_PX * 2);
      } else {
        ctx.beginPath();
        ctx.arc(tx, ty, radPx, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else {
    drawDirectBeamPreview(ctx, ox, oy, angle, aimUnit.id, {
      baseColor: state.weaponMode === 'special'
        ? 'rgba(34, 211, 238, 0.6)'
        : 'rgba(255, 255, 255, 0.42)',
      wallColor: 'rgba(248, 113, 113, 0.82)',
      hitColor: 'rgba(52, 211, 153, 0.9)',
      lineWidth: 1.8,
      dash: [5, 5]
    });
  }
  ctx.restore();
}

export function drawActiveTraces(ctx, now) {
  state.activeTraces = state.activeTraces.filter((tr) => now - tr.startAt <= tr.duration);
  for (const tr of state.activeTraces) {
    const p = (now - tr.startAt) / tr.duration;
    const alpha = 1 - p;
    ctx.save();
    const colorFn = TRACE_COLORS[tr.kind] || TRACE_COLORS.standard;
    ctx.strokeStyle = colorFn(alpha);
    ctx.lineWidth = tr.kind === 'piercing' || tr.kind === 'charged' ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(tr.x1 * CELL_PX, tr.y1 * CELL_PX);
    ctx.lineTo(tr.x2 * CELL_PX, tr.y2 * CELL_PX);
    ctx.stroke();

    const bx = (tr.x1 + (tr.x2 - tr.x1) * Math.min(1, p * 1.4)) * CELL_PX;
    const by = (tr.y1 + (tr.y2 - tr.y1) * Math.min(1, p * 1.4)) * CELL_PX;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx - 2, by - 2, 4, 4);
    ctx.restore();
  }
}

export function drawParticles(ctx, dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    ctx.fillStyle = pt.color;
    ctx.globalAlpha = Math.min(1, pt.life * 2);
    ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
    ctx.globalAlpha = 1;
  }
}

export function drawFloatingTexts(ctx, dt) {
  for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
    const ft = state.floatingTexts[i];
    ft.y -= 24 * dt;
    ft.life -= dt;
    if (ft.life <= 0) {
      state.floatingTexts.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = Math.min(1, ft.life * 1.5);
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#000';
    ctx.fillText(ft.text, ft.x - 9, ft.y + 1);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x - 10, ft.y);
    ctx.restore();
  }
}
