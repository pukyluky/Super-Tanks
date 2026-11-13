const crypto = require('crypto');
const { GRID_W, GRID_H, TANK_SIZE } = require('../config/constants');
const { ARMOR_CATALOG } = require('../data/armors');
const { TURRET_CATALOG } = require('../data/specials1');
const { SPECIAL2_CATALOG } = require('../data/specials2');
const { TANK_TYPES_CATALOG, DIFFICULTY_CONFIG } = require('../data/tanks');
const { isFootprintFree, buildWalkableGrid, findPathAStar } = require('../engine/pathfinding');
const { resolveShot } = require('../engine/combat');
const { serializeHazardsForPlayer, processMovementWithHazards } = require('../engine/hazards');
const { delay, createMatch, checkGameOver, serializeState, beginAITurn } = require('../engine/match');
const { encodeWsText, decodeWsFrames } = require('./websocket');

function attachWebSocketSession(req, socket, { activeWsSockets, shutdownServer }) {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n'
    ].join('\r\n')
  );

  let connected = true;
  activeWsSockets.add(socket);
  let rxBuffer = Buffer.alloc(0);
  let game = null;

  const sendJson = (obj) => {
    if (!connected || socket.destroyed) return;
    socket.write(encodeWsText(JSON.stringify(obj)));
  };

  sendJson({
    type: 'catalog',
    tankTypes: TANK_TYPES_CATALOG,
    armors: ARMOR_CATALOG,
    turrets: TURRET_CATALOG,
    specials2: SPECIAL2_CATALOG,
    difficulties: DIFFICULTY_CONFIG,
    gridW: GRID_W,
    gridH: GRID_H,
    tankSize: TANK_SIZE
  });

  const getPlayerDrone = () =>
    game?.deployables.find((d) => d.kind === 'drone' && d.ownerId === 'player' && d.hp > 0) || null;

  const maybeAutoEndTurn = async (delayBeforeMs = 350) => {
    if (!game || game.phase !== 'player' || game.endingTurn) return;
    const player = game.tanks.find((t) => t.id === 'player');
    if (!player || !player.alive) return;

    const drone = getPlayerDrone();
    const playerHasActions = player.canShoot || (player.trapBurstRemaining || 0) > 0 || player.moveAp > 0;
    const droneHasActions = Boolean(drone && (drone.canShoot || drone.moveAp > 0));

    if (!playerHasActions && !droneHasActions) {
      game.logs.unshift('Sin disparo ni movimiento restante: fin de turno automático.');
      sendJson({ type: 'logs', logs: game.logs.slice(0, 12) });
      await delay(delayBeforeMs);
      if (connected && game.phase === 'player' && !game.endingTurn) {
        await beginAITurn(game, sendJson, () => connected);
      }
      return;
    }

    if (game.activeControl === 'drone' && !droneHasActions && playerHasActions) {
      game.activeControl = 'player';
      sendJson({ type: 'control_changed', activeControl: 'player' });
    } else if (game.activeControl !== 'drone' && !playerHasActions && droneHasActions) {
      game.activeControl = 'drone';
      sendJson({ type: 'control_changed', activeControl: 'drone' });
      sendJson({ type: 'toast', message: 'Control cambiado automáticamente al Dron NetRunner.' });
    }
  };

  const dispatchMovement = async (activeUnit, plannedSteps, autoEndWaitMs) => {
    const { takenSteps, hazardEvents } = processMovementWithHazards(game, activeUnit, plannedSteps);
    sendJson({
      type: 'tank_moved',
      tankId: activeUnit.id,
      x: activeUnit.x,
      y: activeUnit.y,
      dir: activeUnit.dir,
      moveAp: activeUnit.moveAp,
      path: takenSteps
    });
    for (const hev of hazardEvents) {
      sendJson({
        type: 'hazard_triggered',
        hazards: serializeHazardsForPlayer(game),
        deployables: game.deployables,
        tanks: game.tanks,
        events: hev,
        logs: game.logs.slice(0, 12)
      });
    }
    if (checkGameOver(game)) {
      sendJson(serializeState(game));
      return;
    }
    const waitMs = autoEndWaitMs ?? Math.max(300, Math.round((takenSteps.length / 34) * 1000) + 120);
    await maybeAutoEndTurn(waitMs);
  };

  const handleAction = async (msg) => {
    if (msg.type === 'shutdown_server') {
      sendJson({ type: 'server_closing' });
      setTimeout(shutdownServer, 80);
      return;
    }

    if (msg.type === 'start_game') {
      game = createMatch(msg);
      sendJson(serializeState(game));
      return;
    }

    if (!game || game.phase !== 'player' || game.endingTurn) return;
    const player = game.tanks.find((t) => t.id === 'player');
    if (!player || !player.alive) return;

    if (msg.type === 'switch_control') {
      const drone = getPlayerDrone();
      if (!drone) {
        game.activeControl = 'player';
        sendJson({ type: 'control_changed', activeControl: 'player' });
        sendJson({ type: 'toast', message: 'No tienes ningún Dron desplegado.' });
        return;
      }
      const nextCtrl = msg.target === 'player' || msg.target === 'drone'
        ? msg.target
        : (game.activeControl === 'drone' ? 'player' : 'drone');
      game.activeControl = nextCtrl;
      sendJson({ type: 'control_changed', activeControl: game.activeControl });
      return;
    }

    const activeDrone = getPlayerDrone();
    const usingDrone = game.activeControl === 'drone' && Boolean(activeDrone);
    const activeUnit = usingDrone ? activeDrone : player;
    const unitSize = usingDrone ? activeDrone.size : TANK_SIZE;
    const ignoreOverlapId = usingDrone ? null : player.id;

    if (msg.type === 'move_step') {
      const dx = Math.sign(Number(msg.dx) || 0);
      const dy = Math.sign(Number(msg.dy) || 0);
      if ((dx === 0 && dy === 0) || (dx !== 0 && dy !== 0)) return;
      if (activeUnit.moveAp <= 0) return;

      const nx = activeUnit.x + dx;
      const ny = activeUnit.y + dy;
      if (!isFootprintFree(game.grid, nx, ny, game.tanks, ignoreOverlapId, unitSize)) return;

      await dispatchMovement(activeUnit, [{ x: nx, y: ny }], 320);
      return;
    }

    if (msg.type === 'move_to') {
      if (activeUnit.moveAp <= 0) return;
      let tx = Math.max(2, Math.min(GRID_W - 2 - unitSize, Math.floor(Number(msg.x) - unitSize / 2)));
      let ty = Math.max(2, Math.min(GRID_H - 2 - unitSize, Math.floor(Number(msg.y) - unitSize / 2)));

      const walkable = buildWalkableGrid(game.grid, game.tanks, ignoreOverlapId, unitSize);

      if (!walkable[ty]?.[tx]) {
        let best = null;
        let bestD = 1e9;
        for (let oy = -3; oy <= 3; oy++) {
          for (let ox = -3; ox <= 3; ox++) {
            const cx = tx + ox;
            const cy = ty + oy;
            if (cx >= 2 && cy >= 2 && cx <= GRID_W - 2 - unitSize && cy <= GRID_H - 2 - unitSize && walkable[cy][cx]) {
              const d = ox * ox + oy * oy;
              if (d < bestD) {
                bestD = d;
                best = { x: cx, y: cy };
              }
            }
          }
        }
        if (best) {
          tx = best.x;
          ty = best.y;
        }
      }

      const pathCoords = findPathAStar(walkable, activeUnit.x, activeUnit.y, tx, ty, 6000);
      if (!pathCoords || pathCoords.length === 0) {
        sendJson({ type: 'toast', message: 'Destino bloqueado o fuera de ruta.' });
        return;
      }

      await dispatchMovement(activeUnit, pathCoords.slice(0, activeUnit.moveAp));
      return;
    }

    if (msg.type === 'shoot') {
      if (!activeUnit.canShoot) {
        sendJson({
          type: 'toast',
          message: usingDrone
            ? 'El Dron ya disparó en este turno.'
            : 'Ya disparaste en este turno. Pulsa "Terminar Turno".'
        });
        return;
      }
      if (!usingDrone && player.trapBurstRemaining > 0 && msg.mode !== 'special2') {
        sendJson({ type: 'toast', message: 'Debes lanzar la 2ª Trampa Invisible antes de cambiar de disparo.' });
        return;
      }

      const isPlayerSilenced = (player.silencedTurns || 0) > 0;
      if ((msg.mode === 'special' || msg.mode === 'special2') && isPlayerSilenced) {
        sendJson({ type: 'toast', message: '⚡ ¡Supresión PEM activa! No puedes usar habilidades especiales.' });
        return;
      }

      if (usingDrone && msg.mode === 'special') {
        sendJson({ type: 'toast', message: 'El Dron solo puede usar disparo básico [1] o Bomba PEM [3].' });
        return;
      }

      let mode = 'normal';
      if (usingDrone) {
        if (msg.mode === 'special2' && (activeDrone.droneSpecial2Cooldown || 0) === 0) {
          mode = 'special2';
        }
      } else if (player.trapBurstRemaining > 0) {
        mode = 'special2';
      } else if (msg.mode === 'special' && player.specialCooldown === 0) {
        mode = 'special';
      } else if (msg.mode === 'special2' && (player.special2Cooldown === 0 || player.chargedReady)) {
        mode = 'special2';
      }

      const angle = Number(msg.angle) || 0;
      activeUnit.aimAngle = angle;

      const wasCharged = !usingDrone && player.chargedReady;
      const wasInTrapBurst = !usingDrone && player.trapBurstRemaining > 0;
      const shotEvents = resolveShot(game, activeUnit, mode, angle, msg.targetX, msg.targetY);
      activeUnit.canShoot = usingDrone ? false : player.trapBurstRemaining > 0;

      const weaponLabel = mode === 'special2'
        ? SPECIAL2_CATALOG[activeUnit.special2Id].name
        : mode === 'special'
          ? TURRET_CATALOG[activeUnit.turretId].name
          : usingDrone
            ? 'Disparo Dron'
            : activeUnit.basicWeapon === 'short_shotgun'
              ? 'Escopeta Corta'
              : 'Cañón Estándar';

      const hitSummary = shotEvents.tankHits
        .map((h) => `${h.tankName} (-${h.damage} PV${h.destroyed ? ' ¡DESTRUIDO!' : ''})`)
        .join(', ');
      const empSummary = (shotEvents.empAffected || []).join(', ');
      const actionActor = usingDrone ? 'El Dron usa' : 'Usas';

      if (mode === 'special2' && player.special2Id === 'charged_shot' && !wasCharged) {
        game.logs.unshift('Cargas el Tiro Cargado: ¡listo para disparar en el próximo turno!');
      } else if (mode === 'special2' && player.special2Id === 'trap') {
        game.logs.unshift(
          wasInTrapBurst
            ? 'Colocas la 2ª Trampa Invisible (se activarán en 1 turno).'
            : 'Colocas la 1ª Trampa Invisible: lanza otra más (se activarán en 1 turno).'
        );
      } else {
        const suffix = [hitSummary, empSummary].filter(Boolean).join(' • ');
        game.logs.unshift(
          `${actionActor} ${weaponLabel}${suffix ? ` → ${suffix}` : ''}`
        );
      }

      game.deployables = game.deployables.filter((d) => d.hp > 0);
      sendJson({
        type: 'shot_resolved',
        events: shotEvents,
        tanks: game.tanks,
        hazards: serializeHazardsForPlayer(game),
        deployables: game.deployables,
        activeControl: game.activeControl,
        logs: game.logs.slice(0, 12)
      });

      if (checkGameOver(game)) {
        sendJson(serializeState(game));
        return;
      }
      await maybeAutoEndTurn(480);
      return;
    }

    if (msg.type === 'end_turn') {
      await beginAITurn(game, sendJson, () => connected);
    }
  };

  socket.on('data', (chunk) => {
    rxBuffer = Buffer.concat([rxBuffer, chunk]);
    const { messages, remaining } = decodeWsFrames(rxBuffer);
    rxBuffer = remaining;

    for (const frame of messages) {
      if (frame.opcode === 0x8) {
        connected = false;
        socket.end();
        return;
      }
      if (frame.opcode === 0x9) {
        const pong = Buffer.concat([Buffer.from([0x8a, frame.payload.length]), frame.payload]);
        socket.write(pong);
        continue;
      }
      if (frame.opcode === 0x1) {
        try {
          const parsed = JSON.parse(frame.payload.toString('utf8'));
          handleAction(parsed);
        } catch (e) {
          console.error('Error procesando mensaje WS:', e);
        }
      }
    }
  });

  socket.on('close', () => {
    connected = false;
    activeWsSockets.delete(socket);
  });
  socket.on('error', () => {
    connected = false;
    activeWsSockets.delete(socket);
  });
}

module.exports = {
  attachWebSocketSession
};
