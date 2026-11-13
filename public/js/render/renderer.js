import { CELL_PX } from '../constants.js';
import { state, ctx, terrainCanvas } from '../state.js';
import { drawHazard } from '../assets/hazardSprites.js';
import { drawDeployable } from '../assets/deployableSprites.js';
import { drawTankChassis, drawTankTurret } from '../assets/tankSprites.js';
import { drawAimPreview, drawActiveTraces, drawParticles, drawFloatingTexts } from './effects.js';

export function syncVisualTanks(snap = false) {
  const aliveIds = new Set(state.tanks.map((t) => t.id));
  for (const id of state.visualTanks.keys()) {
    if (!aliveIds.has(id)) state.visualTanks.delete(id);
  }
  for (const t of state.tanks) {
    if (!state.visualTanks.has(t.id) || snap) {
      state.visualTanks.set(t.id, {
        x: t.x,
        y: t.y,
        dir: t.dir,
        aimAngle: t.aimAngle,
        queue: [],
        pendingShots: []
      });
    }
  }
}

function drawStatusRingsAndBadges(tank, cx, cy, isSpritePass) {
  if (isSpritePass) {
    if (tank.chargedReady) {
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    if ((tank.poisonTurns || 0) > 0) {
      ctx.strokeStyle = '#a3e635';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, 19, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if ((tank.burnTurns || 0) > 0) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if ((tank.stunnedTurns || 0) > 0) {
      ctx.strokeStyle = tank.stunReason === 'emp' ? '#00d4ff' : '#67e8f9';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 21, 0, Math.PI * 2);
      ctx.stroke();
    }
    if ((tank.silencedTurns || 0) > 0) {
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    return;
  }

  const barW = 30;
  const hpRatio = tank.hp / tank.maxHp;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(cx - barW / 2, cy - 22, barW, 4);
  ctx.fillStyle = tank.team === 'player' ? '#4ade80' : '#f87171';
  ctx.fillRect(cx - barW / 2, cy - 22, Math.max(1, barW * hpRatio), 4);

  if ((tank.poisonTurns || 0) > 0 || (tank.burnTurns || 0) > 0 || (tank.stunnedTurns || 0) > 0 || (tank.silencedTurns || 0) > 0) {
    ctx.font = 'bold 9px monospace';
    let topOffset = 26;
    if ((tank.poisonTurns || 0) > 0) {
      ctx.fillStyle = '#bef264';
      ctx.fillText(`VEN ${tank.poisonTurns}t`, cx - 14, cy - topOffset);
      topOffset += 9;
    }
    if ((tank.burnTurns || 0) > 0) {
      ctx.fillStyle = '#f87171';
      ctx.fillText(`FUE ${tank.burnTurns}t`, cx - 14, cy - topOffset);
      topOffset += 9;
    }
    if ((tank.silencedTurns || 0) > 0) {
      ctx.fillStyle = '#00d4ff';
      ctx.fillText(`PEM ${tank.silencedTurns}t`, cx - 14, cy - topOffset);
    }
    if ((tank.stunnedTurns || 0) > 0) {
      ctx.fillStyle = tank.stunReason === 'emp' ? '#00d4ff' : '#67e8f9';
      ctx.fillText(tank.stunReason === 'emp' ? 'ATUR' : 'CONG', cx - 11, cy + 26);
    }
  }
}

export function startRenderLoop(onShotResolved) {
  let lastFrameTime = performance.now();

  function renderLoop(now) {
    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    if (state.phase !== 'hangar' && state.grid) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(terrainCanvas, 0, 0);

      for (const hz of state.hazards) {
        drawHazard(ctx, hz, now);
      }
      for (const dep of state.deployables) {
        drawDeployable(ctx, dep);
      }

      const player = state.tanks.find((t) => t.id === 'player');
      const playerDrone = state.deployables.find((d) => d.kind === 'drone' && d.ownerId === 'player' && d.hp > 0);
      const usingDrone = Boolean(playerDrone) && state.activeControl === 'drone';

      if (player && player.alive && state.phase === 'player' && state.clickMode === 'move') {
        const moveUnit = usingDrone ? playerDrone : player;
        if (moveUnit.moveAp > 0) {
          const vt = usingDrone ? null : state.visualTanks.get(player.id);
          const sz = usingDrone ? playerDrone.size : state.tankSize;
          const cx = ((vt ? vt.x : moveUnit.x) + sz / 2) * CELL_PX;
          const cy = ((vt ? vt.y : moveUnit.y) + sz / 2) * CELL_PX;
          ctx.save();
          ctx.strokeStyle = usingDrone ? 'rgba(0, 212, 255, 0.45)' : 'rgba(56, 189, 248, 0.35)';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, moveUnit.moveAp * CELL_PX, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      for (const tank of state.tanks) {
        if (!tank.alive) continue;
        let vt = state.visualTanks.get(tank.id);
        if (!vt) {
          vt = { x: tank.x, y: tank.y, dir: tank.dir, aimAngle: tank.aimAngle, queue: [], pendingShots: [] };
          state.visualTanks.set(tank.id, vt);
        }

        if (vt.queue.length > 0) {
          let remainingMove = 34 * dt;
          while (vt.queue.length > 0 && remainingMove > 0) {
            const next = vt.queue[0];
            const dx = next.x - vt.x;
            const dy = next.y - vt.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.001) {
              vt.dir = Math.atan2(dy, dx);
            }
            if (dist <= remainingMove) {
              vt.x = next.x;
              vt.y = next.y;
              remainingMove -= dist;
              vt.queue.shift();
            } else {
              vt.x += (dx / dist) * remainingMove;
              vt.y += (dy / dist) * remainingMove;
              remainingMove = 0;
            }
          }
          if (vt.queue.length === 0 && vt.pendingShots.length > 0) {
            while (vt.pendingShots.length > 0) {
              onShotResolved(vt.pendingShots.shift());
            }
          }
        } else {
          vt.x += (tank.x - vt.x) * Math.min(1, dt * 16);
          vt.y += (tank.y - vt.y) * Math.min(1, dt * 16);
          vt.dir = tank.dir;
          if (tank.id !== 'player' && vt.pendingShots.length === 0) {
            vt.aimAngle = tank.aimAngle;
          }
        }

        const cx = (vt.x + state.tankSize / 2) * CELL_PX;
        const cy = (vt.y + state.tankSize / 2) * CELL_PX;

        ctx.save();
        ctx.translate(cx, cy);
        drawStatusRingsAndBadges(tank, cx, cy, true);
        drawTankChassis(ctx, tank.color, tank.accent, vt.dir, tank.armorId);
        drawTankTurret(ctx, tank.turretId, tank.color, tank.accent, vt.aimAngle);
        ctx.restore();

        drawStatusRingsAndBadges(tank, cx, cy, false);
      }

      drawAimPreview(ctx, player, playerDrone, usingDrone);
      drawActiveTraces(ctx, now);
      drawParticles(ctx, dt);
      drawFloatingTexts(ctx, dt);
    }

    requestAnimationFrame(renderLoop);
  }

  requestAnimationFrame(renderLoop);
}
