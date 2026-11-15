const { GRID_W, GRID_H, TANK_SIZE } = require('../config/constants');
const { TURRET_CATALOG } = require('../data/specials1');
const { SPECIAL2_CATALOG } = require('../data/specials2');
const { isFootprintFree, buildWalkableGrid, findPathAStar } = require('./pathfinding');
const { resolveShot } = require('./combat');
const { serializeHazardsForPlayer, processMovementWithHazards } = require('./hazards');
const {
  delay,
  getControlledTank,
  checkGameOver,
  serializeState
} = require('./match');

function getOwnedDrone(game, ownerId) {
  return game?.deployables.find((d) => d.kind === 'drone' && d.ownerId === ownerId && d.hp > 0) || null;
}

function broadcastForRecipients(game, msg, getRecipients) {
  const recipients = getRecipients();
  if (!msg) return;
  if (msg.type === 'sync_state') {
    for (const r of recipients) {
      r.send(serializeState(game, r.team));
    }
    return;
  }
  if (msg.type === 'shot_resolved' || msg.type === 'hazard_triggered') {
    for (const r of recipients) {
      r.send({
        ...msg,
        hazards: serializeHazardsForPlayer(game, r.team)
      });
    }
    return;
  }
  for (const r of recipients) {
    r.send(msg);
  }
}

async function maybeAutoEndTurn(game, controlledTank, { getRecipients, onAutoEndTurn, isActive, toastRecipient }, delayBeforeMs = 350) {
  if (!game || game.phase !== 'player' || game.endingTurn) return;
  if (!controlledTank || !controlledTank.alive) return;

  const drone = getOwnedDrone(game, controlledTank.id);
  const tankHasActions = controlledTank.canShoot || (controlledTank.trapBurstRemaining || 0) > 0 || controlledTank.moveAp > 0;
  const droneHasActions = Boolean(drone && (drone.canShoot || drone.moveAp > 0));
  const emitAll = (m) => broadcastForRecipients(game, m, getRecipients);

  if (!tankHasActions && !droneHasActions) {
    game.logs.unshift('Sin disparo ni movimiento restante: fin de turno automático.');
    emitAll({ type: 'logs', logs: game.logs.slice(0, 12) });
    if (delayBeforeMs > 0) await delay(delayBeforeMs);
    if (isActive() && game.phase === 'player' && !game.endingTurn) {
      await onAutoEndTurn();
    }
    return;
  }

  if (game.activeControl === 'drone' && !droneHasActions && tankHasActions) {
    game.activeControl = controlledTank.id;
    emitAll({ type: 'control_changed', activeControl: controlledTank.id });
  } else if (game.activeControl !== 'drone' && !tankHasActions && droneHasActions) {
    game.activeControl = 'drone';
    emitAll({ type: 'control_changed', activeControl: 'drone' });
    if (toastRecipient) {
      toastRecipient({ type: 'toast', message: 'Control cambiado automáticamente al Dron NetRunner.' });
    }
  }
}

async function executeTurnAction(game, msg, ctx) {
  const { getRecipients, notifyActor, onEndTurn, isActive } = ctx;
  if (!game || game.phase !== 'player' || game.endingTurn) return false;

  const controlledTank = getControlledTank(game);
  if (!controlledTank || !controlledTank.alive) return false;

  const emitAll = (m) => broadcastForRecipients(game, m, getRecipients);

  if (msg.type === 'switch_control') {
    const drone = getOwnedDrone(game, controlledTank.id);
    if (!drone) {
      game.activeControl = controlledTank.id;
      emitAll({ type: 'control_changed', activeControl: controlledTank.id });
      notifyActor({ type: 'toast', message: 'No tienes ningún Dron desplegado.' });
      return false;
    }
    const nextCtrl = msg.target === 'drone'
      ? 'drone'
      : (msg.target === 'player' || msg.target === 'tank' || msg.target === controlledTank.id)
        ? controlledTank.id
        : (game.activeControl === 'drone' ? controlledTank.id : 'drone');
    game.activeControl = nextCtrl;
    emitAll({ type: 'control_changed', activeControl: game.activeControl });
    return true;
  }

  if (msg.type === 'end_turn') {
    await onEndTurn();
    return true;
  }

  const activeDrone = getOwnedDrone(game, controlledTank.id);
  const usingDrone = game.activeControl === 'drone' && Boolean(activeDrone);
  const activeUnit = usingDrone ? activeDrone : controlledTank;
  const unitSize = usingDrone ? activeDrone.size : TANK_SIZE;
  const ignoreOverlapId = usingDrone ? null : controlledTank.id;

  const runMovement = async (plannedSteps, autoEndWaitMs) => {
    const { takenSteps, hazardEvents } = processMovementWithHazards(game, activeUnit, plannedSteps);
    emitAll({
      type: 'tank_moved',
      tankId: activeUnit.id,
      x: activeUnit.x,
      y: activeUnit.y,
      dir: activeUnit.dir,
      moveAp: activeUnit.moveAp,
      path: takenSteps
    });
    for (const hev of hazardEvents) {
      emitAll({
        type: 'hazard_triggered',
        deployables: game.deployables,
        tanks: game.tanks,
        events: hev,
        logs: game.logs.slice(0, 12)
      });
    }
    if (checkGameOver(game)) {
      emitAll({ type: 'sync_state' });
      return true;
    }
    const waitMs = autoEndWaitMs ?? Math.max(300, Math.round((takenSteps.length / 34) * 1000) + 120);
    await maybeAutoEndTurn(game, controlledTank, {
      getRecipients,
      onAutoEndTurn: onEndTurn,
      isActive,
      toastRecipient: notifyActor
    }, waitMs);
    return true;
  };

  if (msg.type === 'move_step') {
    const dx = Math.sign(Number(msg.dx) || 0);
    const dy = Math.sign(Number(msg.dy) || 0);
    if ((dx === 0 && dy === 0) || (dx !== 0 && dy !== 0)) return false;
    if (activeUnit.moveAp <= 0) return false;

    const nx = activeUnit.x + dx;
    const ny = activeUnit.y + dy;
    if (!isFootprintFree(game.grid, nx, ny, game.tanks, ignoreOverlapId, unitSize)) return false;

    return runMovement([{ x: nx, y: ny }], 320);
  }

  if (msg.type === 'move_to') {
    if (activeUnit.moveAp <= 0) return false;
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
      notifyActor({ type: 'toast', message: 'Destino bloqueado o fuera de ruta.' });
      return false;
    }
    return runMovement(pathCoords.slice(0, activeUnit.moveAp));
  }

  if (msg.type === 'shoot') {
    const requestedSp2 = !usingDrone && msg.mode === 'special2' ? SPECIAL2_CATALOG[controlledTank.special2Id] : null;
    const isSelfBuff = Boolean(requestedSp2 && requestedSp2.selfBuff);

    if (!isSelfBuff && !activeUnit.canShoot) {
      notifyActor({
        type: 'toast',
        message: usingDrone
          ? 'El Dron ya disparó en este turno.'
          : 'Ya disparaste en este turno. Pulsa "Terminar Turno".'
      });
      return false;
    }
    if (!usingDrone && controlledTank.trapBurstRemaining > 0 && msg.mode !== 'special2') {
      notifyActor({ type: 'toast', message: 'Debes lanzar la 2ª Trampa Invisible antes de cambiar de disparo.' });
      return false;
    }

    const isSilenced = (controlledTank.silencedTurns || 0) > 0;
    if ((msg.mode === 'special' || msg.mode === 'special2') && isSilenced) {
      notifyActor({ type: 'toast', message: '⚡ ¡Supresión PEM activa! No puedes usar habilidades especiales.' });
      return false;
    }
    if (usingDrone && msg.mode === 'special') {
      notifyActor({ type: 'toast', message: 'El Dron solo puede usar disparo básico [1] o Bomba PEM [3].' });
      return false;
    }

    if (requestedSp2?.id === 'rage') {
      if (controlledTank.rageActive) {
        notifyActor({ type: 'toast', message: '¡Ira ya está activa en este turno!' });
        return false;
      }
      if (!(controlledTank.hp < controlledTank.maxHp * requestedSp2.maxHpPercent)) {
        notifyActor({ type: 'toast', message: 'Solo puedes activar Ira cuando tu vida baja del 25%.' });
        return false;
      }
    }

    let mode = 'normal';
    if (usingDrone) {
      if (msg.mode === 'special2' && (activeDrone.droneSpecial2Cooldown || 0) === 0) {
        mode = 'special2';
      }
    } else if (controlledTank.trapBurstRemaining > 0) {
      mode = 'special2';
    } else if (msg.mode === 'special' && controlledTank.specialCooldown === 0) {
      mode = 'special';
    } else if (msg.mode === 'special2' && (controlledTank.special2Cooldown === 0 || controlledTank.chargedReady)) {
      mode = 'special2';
    }

    const angle = Number(msg.angle) || 0;
    activeUnit.aimAngle = angle;

    const wasCharged = !usingDrone && controlledTank.chargedReady;
    const wasInTrapBurst = !usingDrone && controlledTank.trapBurstRemaining > 0;
    const prevCanShoot = activeUnit.canShoot;
    const shotEvents = resolveShot(game, activeUnit, mode, angle, msg.targetX, msg.targetY);
    activeUnit.canShoot = isSelfBuff ? prevCanShoot : (usingDrone ? false : controlledTank.trapBurstRemaining > 0);

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
    const healSummary = (shotEvents.heals || []).map((hl) => `+${hl.amount} PV robados`).join(', ');
    const empSummary = (shotEvents.empAffected || []).join(', ');
    const actorTag = game.isPvp
      ? (usingDrone ? `Dron de ${controlledTank.name} usa` : `${controlledTank.name} usa`)
      : (usingDrone ? 'El Dron usa' : 'Usas');

    if (mode === 'special2' && controlledTank.special2Id === 'rage') {
      game.logs.unshift(`¡${controlledTank.name} activa Ira! → -90% daño recibido (1t), +${shotEvents.rageBonusAp} AP desplazamiento`);
    } else if (mode === 'special2' && controlledTank.special2Id === 'charged_shot' && !wasCharged) {
      game.logs.unshift(`${controlledTank.name} carga Tiro Cargado para el próximo turno.`);
    } else if (mode === 'special2' && controlledTank.special2Id === 'trap') {
      game.logs.unshift(
        wasInTrapBurst
          ? `${controlledTank.name} coloca la 2ª Trampa Invisible (se activarán en 1t).`
          : `${controlledTank.name} coloca la 1ª Trampa Invisible: queda otra más.`
      );
    } else {
      const suffix = [hitSummary, healSummary, empSummary].filter(Boolean).join(' • ');
      game.logs.unshift(`${actorTag} ${weaponLabel}${suffix ? ` → ${suffix}` : ''}`);
    }

    game.deployables = game.deployables.filter((d) => d.hp > 0);
    emitAll({
      type: 'shot_resolved',
      events: shotEvents,
      tanks: game.tanks,
      deployables: game.deployables,
      activeControl: game.activeControl,
      logs: game.logs.slice(0, 12)
    });

    if (checkGameOver(game)) {
      emitAll({ type: 'sync_state' });
      return true;
    }
    await maybeAutoEndTurn(game, controlledTank, {
      getRecipients,
      onAutoEndTurn: onEndTurn,
      isActive,
      toastRecipient: notifyActor
    }, 480);
    return true;
  }

  return false;
}

module.exports = {
  getOwnedDrone,
  broadcastForRecipients,
  maybeAutoEndTurn,
  executeTurnAction
};
