import { CELL_PX } from '../constants.js';

export const MOLOTOV_SPRITE = {
  draw(ctx, hz, hx, hy, now) {
    const rad = hz.radius * CELL_PX;
    const flicker = 0.22 + 0.08 * Math.sin(now / 120 + hz.x);
    ctx.fillStyle = `rgba(249, 115, 22, ${flicker})`;
    ctx.beginPath();
    ctx.arc(hx, hy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#fde047';
    for (let i = 0; i < 6; i++) {
      const ang = (now / 400) + i * 1.05;
      const r = (rad * 0.65) * ((i % 2 === 0) ? 0.55 : 0.85);
      ctx.fillRect(Math.round(hx + Math.cos(ang) * r), Math.round(hy + Math.sin(ang) * r), 3, 3);
    }
  }
};

function drawPoolHazard(ctx, hz, hx, hy, now, isFirePool) {
  const rad = hz.radius * CELL_PX;
  const pulse = 0.25 + 0.08 * Math.sin(now / 150 + hz.y);
  ctx.fillStyle = isFirePool
    ? `rgba(220, 38, 38, ${pulse})`
    : `rgba(132, 204, 22, ${pulse})`;
  ctx.beginPath();
  ctx.arc(hx, hy, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = isFirePool ? 'rgba(239, 68, 68, 0.9)' : 'rgba(163, 230, 53, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = isFirePool ? '#fca5a5' : '#bef264';
  for (let i = 0; i < 5; i++) {
    const ang = (now / 520) + i * 1.25;
    const r = (rad * 0.6) * ((i % 2 === 0) ? 0.45 : 0.8);
    ctx.fillRect(Math.round(hx + Math.cos(ang) * r), Math.round(hy + Math.sin(ang) * r), 3, 3);
  }
}

export const POISON_SPRITE = {
  draw(ctx, hz, hx, hy, now) {
    drawPoolHazard(ctx, hz, hx, hy, now, false);
  }
};

export const FIRE_POOL_SPRITE = {
  draw(ctx, hz, hx, hy, now) {
    drawPoolHazard(ctx, hz, hx, hy, now, true);
  }
};

export const FIRE_WALL_SPRITE = {
  draw(ctx, hz, hx, hy, now) {
    const wPx = (hz.thickness || 2) * CELL_PX;
    const hPx = (hz.length || 14) * CELL_PX;
    const flicker = 0.34 + 0.1 * Math.sin(now / 110 + hz.x);
    ctx.translate(hx, hy);
    ctx.rotate(hz.angle || 0);
    ctx.fillStyle = `rgba(220, 38, 38, ${flicker})`;
    ctx.fillRect(-wPx / 2, -hPx / 2, wPx, hPx);
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.95)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-wPx / 2, -hPx / 2, wPx, hPx);
    ctx.fillStyle = '#fca5a5';
    for (let f = -hPx / 2 + 6; f < hPx / 2 - 4; f += 12) {
      const jx = Math.sin(now / 130 + f) * 3;
      ctx.fillRect(Math.round(jx) - 1, Math.round(f) - 1, 3, 3);
    }
  }
};

export const MINE_SPRITE = {
  draw(ctx, hz, hx, hy) {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(hx - 5, hy - 5, 10, 10);
    ctx.fillStyle = hz.team === 'player' ? '#4ade80' : '#ef4444';
    ctx.fillRect(hx - 2, hy - 2, 4, 4);
  }
};

export const TRAP_SPRITE = {
  draw(ctx, hz, hx, hy) {
    const isArming = (hz.armingTurns || 0) > 0;
    ctx.strokeStyle = isArming ? 'rgba(251, 191, 36, 0.8)' : 'rgba(192, 132, 252, 0.85)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(hx, hy, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = isArming ? 'rgba(251, 191, 36, 0.65)' : 'rgba(192, 132, 252, 0.65)';
    ctx.fillRect(hx - 2, hy - 2, 4, 4);
    if (isArming) {
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#fde047';
      ctx.fillText(`${hz.armingTurns}t`, hx - 5, hy - 9);
    }
  }
};

export const HAZARD_SPRITES = {
  molotov: MOLOTOV_SPRITE,
  poison: POISON_SPRITE,
  fire_pool: FIRE_POOL_SPRITE,
  fire_wall: FIRE_WALL_SPRITE,
  mine: MINE_SPRITE,
  trap: TRAP_SPRITE
};

export function drawHazard(ctx, hz, now) {
  const sprite = HAZARD_SPRITES[hz.kind];
  if (!sprite) return;
  const hx = hz.x * CELL_PX;
  const hy = hz.y * CELL_PX;
  ctx.save();
  sprite.draw(ctx, hz, hx, hy, now);
  ctx.restore();
}
