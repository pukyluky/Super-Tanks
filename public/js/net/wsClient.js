import { CELL_PX } from '../constants.js';
import { state, getMyTeamId, canvas, terrainCanvas, dom, showToast } from '../state.js';
import { rebuildTerrainCanvas, redrawCellsNeighborhood } from '../assets/terrainSprites.js';
import { spawnExplosionParticles } from '../render/effects.js';
import { syncVisualTanks } from '../render/renderer.js';
import { renderHangarOptions } from '../ui/hangar.js';
import { updateHUD } from '../ui/hud.js';
import { legacyModem } from './modemAudio.js';
import { handleAdhocServerMessage, updateHostAddrDisplay } from '../ui/multiplayer.js';

const LEGACY_TX_ACTIONS = new Set(['move_step', 'move_to', 'shoot', 'switch_control', 'end_turn']);

export function sendLocalWs(payload) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(payload));
  }
}

export function sendWs(payload) {
  if (state.gameMode === 'pvp_legacy' && payload && LEGACY_TX_ACTIONS.has(payload.type)) {
    const quantized = { ...payload };
    if (quantized.type === 'shoot') {
      quantized.angle = Math.round((Number(quantized.angle) || 0) * 10000) / 10000;
      quantized.targetX = Math.round((Number(quantized.targetX) || 0) * 10) / 10;
      quantized.targetY = Math.round((Number(quantized.targetY) || 0) * 10) / 10;
    } else if (quantized.type === 'move_to') {
      quantized.x = Math.round(Number(quantized.x) || 0);
      quantized.y = Math.round(Number(quantized.y) || 0);
    }
    sendLocalWs(quantized);
    if (legacyModem) {
      legacyModem.sendPacket({ ...quantized, actorTeam: getMyTeamId() });
    }
    return;
  }

  if (state.adhocWs && state.adhocWs.readyState === WebSocket.OPEN) {
    state.adhocWs.send(JSON.stringify(payload));
    return;
  }
  sendLocalWs(payload);
}

export function closeRemoteAdhoc() {
  if (state.adhocWs) {
    try {
      state.adhocWs.onclose = null;
      state.adhocWs.close();
    } catch (_) {}
    state.adhocWs = null;
  }
}

export function normalizeAdhocAddress(rawHostAddr, fallbackPort = 3000) {
  let raw = String(rawHostAddr || '').trim();
  let extractedCode = '';
  const codeMatch = raw.match(/\|\s*c[oó]digo\s*:\s*([A-Za-z0-9]+)/i);
  if (codeMatch) {
    extractedCode = codeMatch[1].toUpperCase();
    raw = raw.slice(0, codeMatch.index).trim();
  }
  let cleanHost = raw
    .replace(/^wss?:\/\//i, '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim();
  if (cleanHost.includes('|')) {
    cleanHost = cleanHost.split('|')[0].trim();
  }
  if (!cleanHost) return { hostPort: '', extractedCode };

  const hasPort = cleanHost.startsWith('[')
    ? /\]:\d+$/.test(cleanHost)
    : /:\d+$/.test(cleanHost);
  if (!hasPort) {
    const port = (state.hostInfo && state.hostInfo.port) || fallbackPort || 3000;
    cleanHost = `${cleanHost}:${port}`;
  }
  return { hostPort: cleanHost, extractedCode };
}

export function connectRemoteAdhoc(rawHostAddr, initialPayload) {
  closeRemoteAdhoc();
  const { hostPort: cleanHost } = normalizeAdhocAddress(rawHostAddr);
  if (!cleanHost) {
    showToast('Introduce la dirección IP:Puerto del Host.');
    return;
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${cleanHost}`);
  state.adhocWs = ws;
  let opened = false;
  let lastErrorMsg = '';

  ws.onopen = () => {
    opened = true;
    if (dom.adhocGuestStatus) dom.adhocGuestStatus.textContent = `Conectado a ${cleanHost}. Sincronizando sala...`;
    ws.send(JSON.stringify(initialPayload));
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'catalog') return;
      handleServerMessage(msg);
    } catch (e) {
      console.error('Error parseando mensaje Ad-Hoc WS:', e);
    }
  };

  ws.onerror = (ev) => {
    lastErrorMsg = (ev && ev.message) || ws.lastErrorMessage || `No se pudo conectar al Host ${cleanHost}`;
    showToast(lastErrorMsg);
    if (dom.adhocGuestStatus) dom.adhocGuestStatus.textContent = lastErrorMsg;
  };

  ws.onclose = () => {
    if (state.adhocWs === ws) {
      state.adhocWs = null;
      if (!opened && dom.adhocGuestStatus) {
        dom.adhocGuestStatus.textContent = lastErrorMsg || `No se pudo conectar a ${cleanHost} (comprueba IP, puerto y Firewall).`;
      }
      if ((state.gameMode === 'pvp_adhoc' && !dom.battleScreen.classList.contains('hidden'))
          || (dom.adhocLobbyScreen && !dom.adhocLobbyScreen.classList.contains('hidden'))) {
        showToast('Conexión con el Host Ad-Hoc cerrada.');
        state.adhocLobby = null;
        state.adhocRoomCode = null;
        state.adhocRoomSsid = null;
        dom.gameoverOverlay.classList.add('hidden');
        dom.adhocLobbyScreen?.classList.add('hidden');
        dom.battleScreen.classList.add('hidden');
        dom.hangarScreen.classList.remove('hidden');
      }
    }
  };
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
    const isBackstab = hit.hitSector === 'back';
    state.floatingTexts.push({
      x: hit.x * CELL_PX,
      y: hit.y * CELL_PX - 12,
      text: isBackstab ? `-${hit.damage} ¡ESPALDA!` : `-${hit.damage}`,
      color: hit.destroyed || isBackstab ? '#fde047' : '#f87171',
      life: isBackstab ? 1.25 : 1.0
    });
  }
  for (const hl of ev.heals || []) {
    spawnExplosionParticles(hl.x, hl.y, 1.5, 'heal');
    state.floatingTexts.push({
      x: hl.x * CELL_PX,
      y: hl.y * CELL_PX - 18,
      text: `+${hl.amount} PV`,
      color: '#4ade80',
      life: 1.1
    });
  }

  updateHUD();
}

function markServerStopped() {
  state.serverStopped = true;
  closeRemoteAdhoc();
  if (state.ws && state.ws.readyState <= WebSocket.OPEN) {
    try {
      state.ws.onclose = null;
      state.ws.close(1000, 'server_stopped');
    } catch (_) {}
  }
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
  setTimeout(() => {
    try {
      window.close();
    } catch (_) {}
  }, 150);
}

let clientExitNotified = false;
function notifyClientExit() {
  if (clientExitNotified) return;
  clientExitNotified = true;
  closeRemoteAdhoc();
  if (window.AndroidBridge || state.serverStopped) return;
  if (state.ws) {
    try {
      state.ws.onclose = null;
      if (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING) {
        state.ws.close(1000, 'client_exit');
      }
    } catch (_) {}
  }
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/client-closing');
    } else {
      fetch('/api/client-closing', { method: 'POST', keepalive: true }).catch(() => {});
    }
  } catch (_) {}
}

export function initShutdownButtons() {
  if (!window.__tanquesExitHookBound) {
    window.__tanquesExitHookBound = true;
    window.addEventListener('pagehide', notifyClientExit);
    window.addEventListener('beforeunload', notifyClientExit);
  }
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
  if (handleAdhocServerMessage(msg)) {
    return;
  }

  if (msg.type === 'catalog') {
    state.catalog = msg;
    state.hostInfo = msg.hostInfo || state.hostInfo;
    state.gridW = msg.gridW;
    state.gridH = msg.gridH;
    state.tankSize = msg.tankSize;
    canvas.width = state.gridW * CELL_PX;
    canvas.height = state.gridH * CELL_PX;
    terrainCanvas.width = canvas.width;
    terrainCanvas.height = canvas.height;
    renderHangarOptions();
    updateHostAddrDisplay();
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

    state.gameMode = msg.mode || 'pve';
    state.isPvp = Boolean(msg.isPvp);
    state.activeTeam = msg.activeTeam || 'player';
    if (msg.myTeam) state.myTeam = msg.myTeam;
    if (msg.turnNumber === 1) {
      dom.gameoverOverlay.classList.add('hidden');
    }

    state.grid = msg.grid;
    state.tanks = msg.tanks;
    state.hazards = msg.hazards || [];
    state.deployables = msg.deployables || [];
    state.turnNumber = msg.turnNumber;
    state.phase = msg.phase;
    state.activeControl = msg.activeControl || getMyTeamId();
    state.winner = msg.winner;
    state.logs = msg.logs || [];

    if (dom.legacyBattleBox) {
      dom.legacyBattleBox.classList.toggle('hidden', state.gameMode !== 'pvp_legacy');
    }
    if (dom.enemyPanelTitle) {
      dom.enemyPanelTitle.textContent = state.isPvp ? 'Rival PvP' : 'Tanques Enemigos';
    }

    if (enteringBattle || msg.turnNumber === 1) {
      state.mobileInfoOpen = false;
      const myTank = state.tanks.find((t) => t.id === getMyTeamId());
      if (myTank) {
        const ang = myTank.aimAngle || 0;
        const ox = myTank.x + state.tankSize / 2;
        const oy = myTank.y + state.tankSize / 2;
        state.mouseGrid = {
          x: ox + Math.cos(ang) * 18,
          y: oy + Math.sin(ang) * 18
        };
      }
    }

    syncVisualTanks(enteringBattle || msg.turnNumber === 1);
    rebuildTerrainCanvas();
    dom.hangarScreen.classList.add('hidden');
    dom.adhocLobbyScreen?.classList.add('hidden');
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
      const vt = state.visualTanks.get(t.id);
      const wasHidden = Boolean(t.hidden || (vt && vt.hidden) || t.x === -999);
      t.x = msg.x;
      t.y = msg.y;
      t.dir = msg.dir;
      t.moveAp = msg.moveAp;
      if (msg.uncloaked) {
        t.invisibleTurns = 0;
        t.hidden = false;
      }
      if (msg.logs) {
        state.logs = msg.logs;
      }
      if (vt && Array.isArray(msg.path) && msg.path.length > 0) {
        if (wasHidden) {
          vt.x = msg.path[0].x;
          vt.y = msg.path[0].y;
          vt.hidden = false;
        }
        vt.queue.push(...msg.path.map((p) => ({ x: p.x, y: p.y })));
      } else if (vt) {
        vt.x = t.x;
        vt.y = t.y;
        vt.dir = t.dir;
        vt.hidden = false;
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
