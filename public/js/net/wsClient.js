import { CELL_PX } from '../constants.js';
import { state, canvas, terrainCanvas, dom, showToast } from '../state.js';
import { rebuildTerrainCanvas, redrawCellsNeighborhood } from '../assets/terrainSprites.js';
import { spawnExplosionParticles } from '../render/effects.js';
import { syncVisualTanks } from '../render/renderer.js';
import { renderHangarOptions } from '../ui/hangar.js';
import { updateHUD } from '../ui/hud.js';

export function sendWs(payload) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(payload));
  }
}

export function applyShotResolved(msg) {
  state.tanks = msg.tanks;
  if (msg.hazards) state.hazards = msg.hazards;
  if (msg.deployables) state.deployables = msg.deployables;
  if (msg.activeControl) state.activeControl = msg.activeControl;
  state.logs = msg.logs || state.logs;
  const ev = msg.events;

  const vtShooter = state.visualTanks.get(ev.shooterId);
  const shooter = state.tanks.find((x) => x.id === ev.shooterId);
  if (vtShooter && shooter) {
    vtShooter.x = shooter.x;
    vtShooter.y = shooter.y;
    vtShooter.aimAngle = typeof ev.aimAngle === 'number' ? ev.aimAngle : shooter.aimAngle;
  }

  if (ev.damagedCells && ev.damagedCells.length > 0) {
    for (const c of ev.damagedCells) {
      const prev = state.grid[c.y][c.x];
      state.grid[c.y][c.x] = c.hp;
      if (prev > 0 && c.hp === 0) {
        state.rubbleSet.add(`${c.x},${c.y}`);
      } else if (c.hp > 0) {
        state.rubbleSet.delete(`${c.x},${c.y}`);
      }
    }
    redrawCellsNeighborhood(ev.damagedCells);
  }

  const now = performance.now();
  for (const tr of ev.traces) {
    state.activeTraces.push({
      ...tr,
      startAt: now,
      duration: tr.kind === 'mortar' || tr.kind === 'builder' ? 380 : 220
    });
  }
  for (const ex of ev.explosions) {
    spawnExplosionParticles(ex.x, ex.y, ex.radius, ex.kind);
  }
  for (const hit of ev.tankHits) {
    state.floatingTexts.push({
      x: hit.x * CELL_PX,
      y: hit.y * CELL_PX - 12,
      text: `-${hit.damage}`,
      color: hit.destroyed ? '#fde047' : '#f87171',
      life: 1.0
    });
  }

  updateHUD();
}

function markServerStopped() {
  state.serverStopped = true;
  dom.wsStatusEl.textContent = 'Servidor cerrado correctamente. Ya puedes cerrar esta pestaña.';
  dom.wsStatusEl.className = 'ws-status err';
  dom.startBtn.disabled = true;
  if (dom.shutdownHangarBtn) dom.shutdownHangarBtn.disabled = true;
  if (dom.shutdownBattleBtn) dom.shutdownBattleBtn.disabled = true;
  showToast('Servidor cerrado correctamente.');
}

async function requestServerShutdown() {
  if (state.serverStopped) return;
  if (!window.confirm('¿Seguro que quieres cerrar el servidor del juego en el portátil?')) return;
  state.serverStopped = true;
  try {
    await fetch('/api/shutdown', { method: 'POST' });
    markServerStopped();
  } catch (err) {
    sendWs({ type: 'shutdown_server' });
    markServerStopped();
  }
}

export function initShutdownButtons() {
  if (dom.shutdownHangarBtn && !dom.shutdownHangarBtn.dataset.bound) {
    dom.shutdownHangarBtn.dataset.bound = '1';
    dom.shutdownHangarBtn.onclick = requestServerShutdown;
  }
  if (dom.shutdownBattleBtn && !dom.shutdownBattleBtn.dataset.bound) {
    dom.shutdownBattleBtn.dataset.bound = '1';
    dom.shutdownBattleBtn.onclick = requestServerShutdown;
  }
}

function handleServerMessage(msg) {
  if (msg.type === 'catalog') {
    state.catalog = msg;
    state.gridW = msg.gridW;
    state.gridH = msg.gridH;
    state.tankSize = msg.tankSize;
    canvas.width = state.gridW * CELL_PX;
    canvas.height = state.gridH * CELL_PX;
    terrainCanvas.width = canvas.width;
    terrainCanvas.height = canvas.height;
    renderHangarOptions();
    dom.startBtn.disabled = false;
    return;
  }

  if (msg.type === 'state') {
    const enteringBattle = dom.hangarScreen && !dom.hangarScreen.classList.contains('hidden');
    for (const vt of state.visualTanks.values()) {
      if (vt.pendingShots && vt.pendingShots.length > 0) {
        while (vt.pendingShots.length > 0) {
          applyShotResolved(vt.pendingShots.shift());
        }
      }
    }

    state.grid = msg.grid;
    state.tanks = msg.tanks;
    state.hazards = msg.hazards || [];
    state.deployables = msg.deployables || [];
    state.turnNumber = msg.turnNumber;
    state.phase = msg.phase;
    state.activeControl = msg.activeControl || 'player';
    state.winner = msg.winner;
    state.logs = msg.logs || [];

    syncVisualTanks(enteringBattle || msg.turnNumber === 1);
    rebuildTerrainCanvas();
    dom.hangarScreen.classList.add('hidden');
    dom.battleScreen.classList.remove('hidden');
    updateHUD();
    return;
  }

  if (msg.type === 'hazard_triggered') {
    state.hazards = msg.hazards || state.hazards;
    state.deployables = msg.deployables || state.deployables;
    state.tanks = msg.tanks || state.tanks;
    state.logs = msg.logs || state.logs;
    const ev = msg.events;
    if (ev) {
      if (ev.damagedCells && ev.damagedCells.length > 0) {
        for (const c of ev.damagedCells) {
          const prev = state.grid[c.y][c.x];
          state.grid[c.y][c.x] = c.hp;
          if (prev > 0 && c.hp === 0) state.rubbleSet.add(`${c.x},${c.y}`);
        }
        redrawCellsNeighborhood(ev.damagedCells);
      }
      spawnExplosionParticles(ev.x, ev.y, ev.radius || 2.0, ev.kind);
      for (const hit of ev.tankHits || []) {
        state.floatingTexts.push({
          x: hit.x * CELL_PX,
          y: hit.y * CELL_PX - 12,
          text: `-${hit.damage}`,
          color: hit.destroyed ? '#fde047' : '#fb923c',
          life: 1.0
        });
      }
    }
    updateHUD();
    return;
  }

  if (msg.type === 'control_changed') {
    state.activeControl = msg.activeControl || 'player';
    updateHUD();
    return;
  }

  if (msg.type === 'tank_moved') {
    const t = state.tanks.find((x) => x.id === msg.tankId);
    if (t) {
      t.x = msg.x;
      t.y = msg.y;
      t.dir = msg.dir;
      t.moveAp = msg.moveAp;
      const vt = state.visualTanks.get(t.id);
      if (vt && Array.isArray(msg.path) && msg.path.length > 0) {
        vt.queue.push(...msg.path.map((p) => ({ x: p.x, y: p.y })));
      } else if (vt) {
        vt.x = t.x;
        vt.y = t.y;
        vt.dir = t.dir;
      }
    } else {
      const dep = state.deployables.find((d) => d.id === msg.tankId);
      if (dep) {
        dep.x = msg.x;
        dep.y = msg.y;
        dep.dir = msg.dir;
        dep.moveAp = msg.moveAp;
      }
    }
    updateHUD();
    return;
  }

  if (msg.type === 'shot_resolved') {
    const vtShooter = state.visualTanks.get(msg.events.shooterId);
    if (vtShooter && vtShooter.queue.length > 0) {
      vtShooter.pendingShots.push(msg);
    } else {
      applyShotResolved(msg);
    }
    return;
  }

  if (msg.type === 'phase_change') {
    state.phase = msg.phase;
    state.logs = msg.logs || state.logs;
    updateHUD();
    return;
  }

  if (msg.type === 'logs') {
    state.logs = msg.logs || state.logs;
    updateHUD();
    return;
  }

  if (msg.type === 'server_closing') {
    markServerStopped();
    return;
  }

  if (msg.type === 'toast') {
    showToast(msg.message);
  }
}

export function connectWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  state.ws = ws;

  ws.onopen = () => {
    dom.wsStatusEl.textContent = 'Conectado al servidor Node.js (WebSocket listo)';
    dom.wsStatusEl.className = 'ws-status ok';
  };

  ws.onclose = () => {
    if (state.serverStopped) {
      dom.wsStatusEl.textContent = 'Servidor cerrado correctamente. Ya puedes cerrar esta pestaña.';
      dom.wsStatusEl.className = 'ws-status err';
      dom.startBtn.disabled = true;
      return;
    }
    dom.wsStatusEl.textContent = 'Desconectado del servidor. Reintentando...';
    dom.wsStatusEl.className = 'ws-status err';
    dom.startBtn.disabled = true;
    setTimeout(connectWebSocket, 1800);
  };

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    handleServerMessage(msg);
  };
}
