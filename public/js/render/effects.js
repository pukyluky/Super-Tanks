import { CELL_PX } from '../constants.js';
import { state } from '../state.js';
import { PARTICLE_PALETTES, TRACE_COLORS, SPECIAL2_PREVIEW_COLORS } from '../assets/palettes.js';

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

function drawShotgunReticle(ctx, px, py, angle, pellets, spreadDeg, rangePx, color) {
  const half = ((spreadDeg * Math.PI) / 180) / 2;
  ctx.strokeStyle = color;
  ctx.setLineDash([4, 4]);
  for (let i = 0; i < pellets; i++) {
    const offset = pellets === 1 ? 0 : -half + (i / (pellets - 1)) * half * 2;
    const a = angle + offset;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(a) * rangePx, py + Math.sin(a) * rangePx);
    ctx.stroke();
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
  const mx = state.mouseGrid.x * CELL_PX;
  const my = state.mouseGrid.y * CELL_PX;

  ctx.save();
  if (state.weaponMode === 'normal' && !usingDrone && player.basicWeapon === 'short_shotgun') {
    drawShotgunReticle(ctx, px, py, angle, 4, 28, 22 * CELL_PX, 'rgba(0, 212, 255, 0.72)');
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
    drawShotgunReticle(ctx, px, py, angle, tu.pellets, tu.spreadDeg, 46 * CELL_PX, 'rgba(251, 146, 60, 0.65)');
  } else if (!usingDrone && state.weaponMode === 'special' && player.turretId === 'bloodsucker' && player.specialCooldown === 0) {
    const tu = state.catalog.turrets.bloodsucker;
    drawShotgunReticle(ctx, px, py, angle, tu.pellets, tu.spreadDeg, tu.range * CELL_PX, 'rgba(225, 29, 72, 0.8)');
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
    const dist = Math.min(tu.range, Math.max(4, Math.hypot(state.mouseGrid.x - ox, state.mouseGrid.y - oy)));
    const tx = (ox + Math.cos(angle) * dist) * CELL_PX;
    const ty = (oy + Math.sin(angle) * dist) * CELL_PX;
    ctx.strokeStyle = player.turretId === 'fire_shot' ? 'rgba(239, 68, 68, 0.85)' : 'rgba(163, 230, 53, 0.8)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(tx, ty, tu.puddleRadius * CELL_PX, 0, Math.PI * 2);
    ctx.stroke();
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
      ctx.strokeStyle = sp2.id === 'freeze_shot'
        ? 'rgba(103, 232, 249, 0.85)'
        : player.chargedReady ? 'rgba(34, 211, 238, 0.85)' : 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = player.chargedReady || sp2.id === 'freeze_shot' ? 2.5 : 1.5;
      ctx.setLineDash(player.chargedReady ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(mx, my);
      ctx.stroke();
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
    ctx.strokeStyle = state.weaponMode === 'special'
      ? 'rgba(34, 211, 238, 0.6)'
      : 'rgba(255, 255, 255, 0.35)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(mx, my);
    ctx.stroke();
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
