const { GRID_W, GRID_H, TANK_SIZE } = require('../config/constants');
const { ARMOR_CATALOG } = require('../data/armors');
const { TURRET_CATALOG } = require('../data/specials1');
const { SPECIAL2_CATALOG } = require('../data/specials2');
const { TANK_TYPES_CATALOG, DIFFICULTY_CONFIG } = require('../data/tanks');
const { generateArena } = require('./mapGenerator');
const { buildWalkableGrid, findPathAStar } = require('./pathfinding');
const { raycastWallDDA, findClosestTankHit, hasLineOfSightToTank } = require('./physics');
const { resolveShot } = require('./combat');
const {
  serializeHazardsForPlayer,
  armTeamTraps,
  processMovementWithHazards,
  tickMolotovZones,
  applyTurnStartPoison,
  computeTurnMoveAp
} = require('./hazards');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTankEntity({
  id,
  name,
  team,
  tankType,
  armor,
  turret,
  x,
  y,
  dir,
  hp,
  moveAp,
  color,
  accent
}) {
  return {
    id,
    name,
    team,
    tankTypeId: tankType.id,
    tankTypeName: tankType.name,
    armorId: armor.id,
    armorName: armor.name,
    basicWeapon: tankType.basicWeapon || 'standard',
    turretId: turret.id,
    special2Id: tankType.special2Id,
    x,
    y,
    dir,
    aimAngle: dir,
    hp,
    maxHp: hp,
    moveAp,
    maxMoveAp: moveAp,
    canShoot: true,
    specialCooldown: 0,
    special2Cooldown: 0,
    chargedReady: false,
    trapBurstRemaining: 0,
    slowedTurns: 0,
    empSlowTurns: 0,
    silencedTurns: 0,
    poisonTurns: 0,
    poisonDamage: 0,
    burnTurns: 0,
    burnDamage: 0,
    stunnedTurns: 0,
    stunReason: null,
    wasStunnedThisTurn: false,
    alive: true,
    color,
    accent
  };
}

function createMatch(config) {
  const diff = DIFFICULTY_CONFIG[config.difficulty] || DIFFICULTY_CONFIG.normal;
  const armor = ARMOR_CATALOG[config.armorId || config.chassisId] || ARMOR_CATALOG.medium;
  const tankType = TANK_TYPES_CATALOG[config.tankTypeId] ||
    Object.values(TANK_TYPES_CATALOG).find((t) => t.turretId === config.turretId) ||
    TANK_TYPES_CATALOG.artillery;
  const turret = TURRET_CATALOG[tankType.turretId];
  const grid = generateArena(config.mapStyle || 'bunkers');

  const playerTank = createTankEntity({
    id: 'player',
    name: 'Comandante (Tú)',
    team: 'player',
    tankType,
    armor,
    turret,
    x: 8,
    y: 34,
    dir: 0,
    hp: armor.maxHp,
    moveAp: armor.moveAp,
    color: tankType.color,
    accent: tankType.accent
  });

  const enemySpawns = [
    { x: 108, y: 12 },
    { x: 108, y: 56 },
    { x: 108, y: 34 },
    { x: 84, y: 8 }
  ];
  const enemyArmorOrder = ['medium', 'light', 'heavy', 'medium'];
  const enemyTypeOrder = ['artillery', 'prisma', 'hunter', 'chemist'];
  const enemyColors = [
    { color: '#f87171', accent: '#991b1b' },
    { color: '#fb7185', accent: '#9f1239' },
    { color: '#e879f9', accent: '#701a75' },
    { color: '#f472b6', accent: '#9d174d' }
  ];

  const tanks = [playerTank];
  for (let i = 0; i < diff.enemyCount; i++) {
    const sp = enemySpawns[i];
    const ea = ARMOR_CATALOG[enemyArmorOrder[i % enemyArmorOrder.length]];
    const etype = TANK_TYPES_CATALOG[enemyTypeOrder[i % enemyTypeOrder.length]];
    const et = TURRET_CATALOG[etype.turretId];
    const hp = Math.round(ea.maxHp * diff.hpScale);
    const ap = Math.round(ea.moveAp * diff.apScale);

    tanks.push(createTankEntity({
      id: `ai_${i + 1}`,
      name: `IA-${i + 1} (${etype.name})`,
      team: 'ai',
      tankType: etype,
      armor: ea,
      turret: et,
      x: sp.x,
      y: sp.y,
      dir: Math.PI,
      hp,
      moveAp: ap,
      color: enemyColors[i % enemyColors.length].color,
      accent: enemyColors[i % enemyColors.length].accent
    }));
  }

  return {
    difficulty: diff.id,
    mapStyle: config.mapStyle || 'bunkers',
    turnNumber: 1,
    phase: 'player',
    activeControl: 'player',
    winner: null,
    endingTurn: false,
    nextEntityId: 1,
    grid,
    tanks,
    hazards: [],
    deployables: [],
    logs: [
      `Partida iniciada (${diff.name}) con ${tankType.name} (${armor.name}).`
    ]
  };
}

function checkGameOver(game) {
  const player = game.tanks.find((t) => t.id === 'player');
  const aliveAi = game.tanks.filter((t) => t.team === 'ai' && t.alive);
  if (!player || !player.alive) {
    game.phase = 'gameover';
    game.winner = 'ai';
    game.logs.unshift('¡Tu unidad ha sido destruida! Victoria de la IA.');
    return true;
  }
  if (aliveAi.length === 0) {
    game.phase = 'gameover';
    game.winner = 'player';
    game.logs.unshift(`¡Victoria total en ${game.turnNumber} turnos! Todas las unidades enemigas destruidas.`);
    return true;
  }
  return false;
}

function serializeGrid(grid) {
  return grid.map((row) => Array.from(row));
}

function serializeState(game) {
  return {
    type: 'state',
    gridW: GRID_W,
    gridH: GRID_H,
    tankSize: TANK_SIZE,
    difficulty: game.difficulty,
    mapStyle: game.mapStyle,
    turnNumber: game.turnNumber,
    phase: game.phase,
    activeControl: game.activeControl || 'player',
    winner: game.winner,
    grid: serializeGrid(game.grid),
    tanks: game.tanks,
    hazards: serializeHazardsForPlayer(game),
    deployables: game.deployables.filter((d) => d.hp > 0),
    logs: game.logs.slice(0, 12)
  };
}

async function runDeployableTurrets(game, team, sendMessage, isActive) {
  const activeTurrets = game.deployables.filter((d) => d.hp > 0 && d.team === team && d.kind !== 'drone');
  for (const tur of activeTurrets) {
    if (!isActive() || game.phase === 'gameover') return;
    const ox = tur.x + tur.size / 2;
    const oy = tur.y + tur.size / 2;

    let bestTarget = null;
    let bestDist = 1e9;
    for (const enemy of game.tanks) {
      if (!enemy.alive || enemy.team === team) continue;
      const ex = enemy.x + TANK_SIZE / 2;
      const ey = enemy.y + TANK_SIZE / 2;
      const dist = Math.hypot(ex - ox, ey - oy);
      if (dist > tur.range) continue;

      const angle = Math.atan2(ey - oy, ex - ox);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const wallHit = raycastWallDDA(game.grid, ox, oy, dx, dy, tur.range);
      const targetHit = findClosestTankHit(game.tanks, ox, oy, dx, dy, wallHit.t, tur.id);
      if (targetHit && targetHit.kind === 'tank' && targetHit.tank.id === enemy.id && dist < bestDist) {
        bestDist = dist;
        bestTarget = { enemy, angle, hitX: targetHit.x, hitY: targetHit.y };
      }
    }

    if (bestTarget) {
      tur.aimAngle = bestTarget.angle;
      const target = bestTarget.enemy;
      target.hp = Math.max(0, target.hp - tur.damage);
      if (target.hp === 0) target.alive = false;

      game.logs.unshift(`${tur.name} dispara a ${target.name} (-${tur.damage} PV${!target.alive ? ' ¡DESTRUIDO!' : ''})`);
      sendMessage({
        type: 'shot_resolved',
        events: {
          shooterId: tur.id,
          aimAngle: tur.aimAngle,
          weaponMode: 'auto_turret',
          turretId: 'auto_turret',
          traces: [{ x1: ox, y1: oy, x2: bestTarget.hitX, y2: bestTarget.hitY, kind: 'builder' }],
          explosions: [{ x: bestTarget.hitX, y: bestTarget.hitY, radius: 1.8, kind: 'builder' }],
          damagedCells: [],
          tankHits: [
            {
              tankId: target.id,
              tankName: target.name,
              damage: tur.damage,
              remainingHp: target.hp,
              destroyed: !target.alive,
              x: bestTarget.hitX,
              y: bestTarget.hitY
            }
          ]
        },
        tanks: game.tanks,
        hazards: serializeHazardsForPlayer(game),
        deployables: game.deployables.filter((d) => d.hp > 0),
        logs: game.logs.slice(0, 12)
      });

      await delay(360);
      if (checkGameOver(game)) {
        sendMessage(serializeState(game));
        return;
      }
    }

    if (typeof tur.turnsLeft === 'number') {
      tur.turnsLeft -= 1;
      if (tur.turnsLeft <= 0) {
        tur.hp = 0;
        game.logs.unshift(`${tur.name} agotó sus ${SPECIAL2_CATALOG.auto_turret.duration} turnos y se desactivó.`);
      }
    }
  }

  game.deployables = game.deployables.filter((d) => d.hp > 0);
  if (activeTurrets.length > 0 && isActive() && game.phase !== 'gameover') {
    sendMessage({
      type: 'hazard_triggered',
      hazards: serializeHazardsForPlayer(game),
      deployables: game.deployables,
      tanks: game.tanks,
      events: null,
      logs: game.logs.slice(0, 12)
    });
  }
}

async function beginAITurn(game, sendMessage, isActive) {
  if (!game || game.phase !== 'player' || game.endingTurn) return;
  const player = game.tanks.find((t) => t.id === 'player');
  if (player && player.trapBurstRemaining > 0) {
    player.trapBurstRemaining = 0;
    player.special2Cooldown = SPECIAL2_CATALOG.trap.cooldown;
  }
  if (player) {
    if (!player.wasStunnedThisTurn && (player.silencedTurns || 0) > 0) {
      player.silencedTurns -= 1;
    }
    player.wasStunnedThisTurn = false;
  }
  game.activeControl = 'player';
  game.endingTurn = true;
  game.phase = 'ai';
  game.logs.unshift('Turno de la IA...');
  sendMessage({ type: 'phase_change', phase: 'ai', logs: game.logs.slice(0, 12) });

  await runDeployableTurrets(game, 'player', sendMessage, isActive);
  if (!isActive() || game.phase === 'gameover') return;

  tickMolotovZones(game, sendMessage);
  if (checkGameOver(game)) {
    sendMessage(serializeState(game));
    return;
  }

  await runAITurn(game, sendMessage, isActive);
}

async function runAITurn(game, sendMessage, isActive) {
  const diff = DIFFICULTY_CONFIG[game.difficulty] || DIFFICULTY_CONFIG.normal;
  const player = game.tanks.find((t) => t.id === 'player');
  const aiTanks = game.tanks.filter((t) => t.team === 'ai' && t.alive);
  armTeamTraps(game, 'ai');

  for (const ai of aiTanks) {
    if (!isActive() || game.phase === 'gameover') return;

    applyTurnStartPoison(game, ai, sendMessage);
    if (checkGameOver(game)) {
      sendMessage(serializeState(game));
      return;
    }
    if (!ai.alive) {
      await delay(200);
      continue;
    }

    ai.trapBurstRemaining = 0;
    if (ai.specialCooldown > 0) ai.specialCooldown--;
    if (ai.special2Cooldown > 0 && !ai.chargedReady) ai.special2Cooldown--;

    if ((ai.stunnedTurns || 0) > 0) {
      ai.stunnedTurns -= 1;
      const isEmpStun = ai.stunReason === 'emp';
      ai.stunReason = null;
      ai.moveAp = 0;
      ai.canShoot = false;
      if (ai.slowedTurns > 0) ai.slowedTurns--;
      game.logs.unshift(
        isEmpStun
          ? `⚡ ${ai.name} está aturdido por Bomba PEM y pierde este turno.`
          : `❄️ ${ai.name} está congelado y pierde este turno.`
      );
      sendMessage({
        type: 'hazard_triggered',
        hazards: serializeHazardsForPlayer(game),
        deployables: game.deployables,
        tanks: game.tanks,
        events: null,
        logs: game.logs.slice(0, 12)
      });
      await delay(320);
      continue;
    }

    const aiSuppressed = (ai.silencedTurns || 0) > 0;
    ai.moveAp = computeTurnMoveAp(ai);
    if (ai.slowedTurns > 0) ai.slowedTurns--;
    if (ai.empSlowTurns > 0) ai.empSlowTurns--;
    ai.canShoot = true;

    const walkable = buildWalkableGrid(game.grid, game.tanks, ai.id);
    const candidates = [
      { x: player.x, y: player.y },
      { x: Math.max(2, player.x - 16), y: player.y },
      { x: Math.min(GRID_W - 6, player.x + 16), y: player.y },
      { x: player.x, y: Math.max(2, player.y - 14) },
      { x: player.x, y: Math.min(GRID_H - 6, player.y + 14) }
    ];

    let bestPath = null;
    for (const c of candidates) {
      if (!walkable[c.y]?.[c.x]) continue;
      const p = findPathAStar(walkable, ai.x, ai.y, c.x, c.y, 4500);
      if (p && (!bestPath || p.length < bestPath.length)) {
        bestPath = p;
      }
    }

    if (!bestPath) {
      let bestDist = 1e9;
      let fallbackTarget = null;
      for (let y = 4; y < GRID_H - 6; y += 4) {
        for (let x = 4; x < GRID_W - 6; x += 4) {
          if (!walkable[y][x]) continue;
          const d = Math.hypot(x - player.x, y - player.y);
          if (d < bestDist) {
            bestDist = d;
            fallbackTarget = { x, y };
          }
        }
      }
      if (fallbackTarget) {
        bestPath = findPathAStar(walkable, ai.x, ai.y, fallbackTarget.x, fallbackTarget.y, 4000);
      }
    }

    const distToPlayer = Math.hypot(player.x - ai.x, player.y - ai.y);
    const hasLOS = hasLineOfSightToTank(game.grid, game.tanks, ai, player);

    if (bestPath && bestPath.length > 0 && !(hasLOS && distToPlayer < 26 && game.difficulty !== 'easy')) {
      const maxSteps = game.difficulty === 'easy'
        ? Math.max(4, Math.floor(ai.moveAp * 0.65))
        : ai.moveAp;
      const plannedSteps = bestPath.slice(0, maxSteps);
      if (plannedSteps.length > 0) {
        const { takenSteps, hazardEvents } = processMovementWithHazards(game, ai, plannedSteps);

        if (takenSteps.length > 0) {
          sendMessage({
            type: 'tank_moved',
            tankId: ai.id,
            x: ai.x,
            y: ai.y,
            dir: ai.dir,
            moveAp: ai.moveAp,
            path: takenSteps
          });
          const moveMs = Math.max(260, Math.round((takenSteps.length / 34) * 1000) + 120);
          await delay(moveMs);
        }

        for (const hev of hazardEvents) {
          sendMessage({
            type: 'hazard_triggered',
            hazards: serializeHazardsForPlayer(game),
            deployables: game.deployables,
            tanks: game.tanks,
            events: hev,
            logs: game.logs.slice(0, 12)
          });
          await delay(220);
        }

        if (checkGameOver(game)) {
          sendMessage(serializeState(game));
          return;
        }
      }
    }

    if (!isActive() || game.phase === 'gameover') return;
    if (!ai.alive) continue;

    const ox = ai.x + TANK_SIZE / 2;
    const oy = ai.y + TANK_SIZE / 2;
    const px = player.x + TANK_SIZE / 2;
    const py = player.y + TANK_SIZE / 2;
    const directAngle = Math.atan2(py - oy, px - ox);
    const distNow = Math.hypot(px - ox, py - oy);
    const losNow = hasLineOfSightToTank(game.grid, game.tanks, ai, player);

    let chosenMode = 'normal';
    const canSpecial1 = !aiSuppressed && ai.specialCooldown === 0;
    const canSpecial2 = !aiSuppressed && (ai.special2Cooldown === 0 || ai.chargedReady);
    if (!aiSuppressed && ai.chargedReady) {
      chosenMode = 'special2';
    } else if (canSpecial1 && Math.random() < diff.useSpecialChance) {
      if (ai.turretId === 'mortar' && distNow <= TURRET_CATALOG.mortar.range) {
        chosenMode = 'special';
      } else if (ai.turretId === 'shotgun' && distNow <= 38) {
        chosenMode = 'special';
      } else if (ai.turretId === 'piercing' && distNow <= 85) {
        chosenMode = 'special';
      } else if (ai.turretId === 'ricochet' && (losNow || game.difficulty === 'hard')) {
        chosenMode = 'special';
      } else if (ai.turretId === 'builder' && distNow > 18 && distNow <= TURRET_CATALOG.builder.range) {
        chosenMode = 'special';
      } else if ((ai.turretId === 'toxic' || ai.turretId === 'fire_shot') && (losNow || distNow <= TURRET_CATALOG.toxic.range)) {
        chosenMode = 'special';
      }
    } else if (canSpecial2 && Math.random() < diff.useSpecialChance * 0.6) {
      if ((ai.special2Id === 'molotov' || ai.special2Id === 'fire_wall' || ai.special2Id === 'emp_bomb') && distNow <= SPECIAL2_CATALOG.fire_wall.range) {
        chosenMode = 'special2';
      } else if ((ai.special2Id === 'charged_shot' || ai.special2Id === 'freeze_shot') && losNow) {
        chosenMode = 'special2';
      } else if ((ai.special2Id === 'landmine' || ai.special2Id === 'trap') && distNow <= 45) {
        chosenMode = 'special2';
      }
    }

    let shouldFire =
      losNow ||
      (chosenMode === 'special' && (ai.turretId === 'mortar' || ai.turretId === 'piercing' || ai.turretId === 'builder' || ai.turretId === 'toxic' || ai.turretId === 'fire_shot')) ||
      (chosenMode === 'special2' && (ai.special2Id === 'molotov' || ai.special2Id === 'fire_wall' || ai.special2Id === 'landmine' || ai.special2Id === 'trap' || ai.special2Id === 'emp_bomb'));
    if (!shouldFire) {
      const probe = raycastWallDDA(game.grid, ox, oy, Math.cos(directAngle), Math.sin(directAngle), 60);
      if (probe.hit && probe.cellVal > 0) {
        shouldFire = true;
      }
    }

    if (shouldFire) {
      let burstIndex = 0;
      do {
        const jitter = (Math.random() * 2 - 1) * diff.aimJitterRad + burstIndex * 0.18;
        const fireAngle = directAngle + jitter;
        ai.aimAngle = fireAngle;

        const isMidPoint =
          (chosenMode === 'special' && ai.turretId === 'builder') ||
          (chosenMode === 'special2' && (ai.special2Id === 'landmine' || ai.special2Id === 'trap'));
        const offsetFactor = burstIndex === 0 ? 0.55 : 0.72;
        const tx = isMidPoint ? ox + (px - ox) * offsetFactor : px;
        const ty = isMidPoint ? oy + (py - oy) * offsetFactor : py;
        const shotEvents = resolveShot(game, ai, chosenMode, fireAngle, tx, ty);
        ai.canShoot = ai.trapBurstRemaining > 0;

        const weaponLabel = chosenMode === 'special2'
          ? SPECIAL2_CATALOG[ai.special2Id].name
          : chosenMode === 'special'
            ? TURRET_CATALOG[ai.turretId].name
            : ai.basicWeapon === 'short_shotgun'
              ? 'Escopeta Corta'
              : 'Cañón Estándar';
        const hitSummary = shotEvents.tankHits
          .map((h) => `${h.tankName} (-${h.damage} PV)`)
          .join(', ');
        game.logs.unshift(
          `${ai.name} usa ${weaponLabel}${hitSummary ? ` → ${hitSummary}` : ''}`
        );

        sendMessage({
          type: 'shot_resolved',
          events: shotEvents,
          tanks: game.tanks,
          hazards: serializeHazardsForPlayer(game),
          deployables: game.deployables.filter((d) => d.hp > 0),
          logs: game.logs.slice(0, 12)
        });

        await delay(burstIndex === 0 ? 460 : 320);
        if (checkGameOver(game)) {
          sendMessage(serializeState(game));
          return;
        }
        burstIndex++;
      } while (ai.trapBurstRemaining > 0 && ai.alive && isActive() && game.phase !== 'gameover');
    } else {
      game.logs.unshift(`${ai.name} se reposiciona sin línea de tiro.`);
      sendMessage({ type: 'logs', logs: game.logs.slice(0, 12) });
      await delay(220);
    }

    if (aiSuppressed && ai.silencedTurns > 0) {
      ai.silencedTurns -= 1;
    }
  }

  await runDeployableTurrets(game, 'ai', sendMessage, isActive);
  if (!isActive() || game.phase === 'gameover') return;

  game.turnNumber += 1;
  game.phase = 'player';
  game.endingTurn = false;
  game.activeControl = 'player';
  armTeamTraps(game, 'player');
  applyTurnStartPoison(game, player, sendMessage);
  if (checkGameOver(game)) {
    sendMessage(serializeState(game));
    return;
  }
  player.trapBurstRemaining = 0;
  if (player.specialCooldown > 0) player.specialCooldown--;
  if (player.special2Cooldown > 0 && !player.chargedReady) player.special2Cooldown--;

  for (const d of game.deployables) {
    if (d.kind === 'drone' && d.ownerId === player.id && d.hp > 0) {
      d.moveAp = d.maxMoveAp;
      d.canShoot = true;
      if ((d.droneSpecial2Cooldown || 0) > 0) d.droneSpecial2Cooldown--;
    }
  }

  if ((player.stunnedTurns || 0) > 0) {
    player.stunnedTurns -= 1;
    const isEmpStun = player.stunReason === 'emp';
    player.stunReason = null;
    player.wasStunnedThisTurn = true;
    player.moveAp = 0;
    player.canShoot = false;
    if (player.slowedTurns > 0) player.slowedTurns--;
    game.logs.unshift(
      isEmpStun
        ? `⚡ --- Turno ${game.turnNumber}: ¡Estás aturdido por Bomba PEM y pierdes este turno! ---`
        : `❄️ --- Turno ${game.turnNumber}: ¡Estás congelado y pierdes este turno! ---`
    );
    sendMessage(serializeState(game));
    sendMessage({
      type: 'toast',
      message: isEmpStun
        ? '⚡ ¡Aturdido por Bomba PEM! Pierdes este turno.'
        : '❄️ ¡Has sido congelado! Pierdes este turno.'
    });
    await delay(1100);
    if (isActive() && game.phase === 'player' && !game.endingTurn && player.alive) {
      await beginAITurn(game, sendMessage, isActive);
    }
    return;
  }

  player.wasStunnedThisTurn = false;
  player.moveAp = computeTurnMoveAp(player);
  if (player.slowedTurns > 0) player.slowedTurns--;
  if (player.empSlowTurns > 0) player.empSlowTurns--;
  player.canShoot = true;
  game.logs.unshift(`--- Turno ${game.turnNumber}: Tu turno ---`);
  sendMessage(serializeState(game));
}

module.exports = {
  delay,
  createMatch,
  checkGameOver,
  serializeGrid,
  serializeState,
  runDeployableTurrets,
  beginAITurn,
  runAITurn
};
