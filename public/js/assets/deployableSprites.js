import { CELL_PX } from '../constants.js';
import { state } from '../state.js';

export const DRONE_SPRITE = {
  draw(ctx, dep, dx, dy) {
    ctx.save();
    ctx.translate(dx, dy);

    const isCtrl = state.activeControl === 'drone' && dep.team === 'player';
    if (isCtrl) {
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(-9, -9, 5, 5);
    ctx.fillRect(4, -9, 5, 5);
    ctx.fillRect(-9, 4, 5, 5);
    ctx.fillRect(4, 4, 5, 5);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-6, -6, 12, 12);
    ctx.fillStyle = dep.team === 'player' ? '#00d4ff' : '#f43f5e';
    ctx.fillRect(-4, -4, 8, 8);
    ctx.rotate(dep.aimAngle || 0);
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(2, -1.5, 9, 3);
    ctx.restore();

    for (let p = 0; p < dep.maxHp; p++) {
      ctx.fillStyle = p < dep.hp ? '#00d4ff' : '#334155';
      ctx.fillRect(dx - 6 + p * 7, dy - 14, 5, 3);
    }
  }
};

export const AUTO_TURRET_SPRITE = {
  draw(ctx, dep, dx, dy) {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-7, -7, 14, 14);
    ctx.fillStyle = dep.team === 'player' ? '#14b8a6' : '#e11d48';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.rotate(dep.aimAngle || 0);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, -2, 11, 4);
    ctx.restore();

    for (let p = 0; p < dep.maxHp; p++) {
      ctx.fillStyle = p < dep.hp ? '#2dd4bf' : '#334155';
      ctx.fillRect(dx - 6 + p * 7, dy - 12, 5, 3);
    }
    if (typeof dep.turnsLeft === 'number') {
      ctx.save();
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#99f6e4';
      ctx.fillText(`${dep.turnsLeft}t`, dx - 5, dy + 16);
      ctx.restore();
    }
  }
};

export const DEPLOYABLE_SPRITES = {
  drone: DRONE_SPRITE,
  auto_turret: AUTO_TURRET_SPRITE
};

export function drawDeployable(ctx, dep) {
  if (dep.hp <= 0) return;
  const dx = (dep.x + dep.size / 2) * CELL_PX;
  const dy = (dep.y + dep.size / 2) * CELL_PX;
  const sprite = DEPLOYABLE_SPRITES[dep.kind] || DEPLOYABLE_SPRITES.auto_turret;
  sprite.draw(ctx, dep, dx, dy);
}
