const { GRID_W, GRID_H, TANK_SIZE } = require('../config/constants');
const { ARMOR_CATALOG } = require('../data/armors');
const { TURRET_CATALOG } = require('../data/specials1');
const { SPECIAL2_CATALOG } = require('../data/specials2');
const { TANK_TYPES_CATALOG, DIFFICULTY_CONFIG } = require('../data/tanks');
const { generateArena } = require('./mapGenerator');
const { buildWalkableGrid, findPathAStar } = require('./pathfinding');
const {
  applyTankDamage,
  raycastWallDDA,
  findClosestTankHit,
  hasLineOfSightToEntity,
  hasLineOfSightToTank,
  isTankExposedToObserverAt
} = require('./physics');
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
    passive: tankType.passive || null,
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
    rageActive: false,
    rageDamageReduction: 0,
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

function getGameActiveTeam(game) {
  if (!game) return 'player';
  return game.isPvp ? (game.activeTeam || 'player1') : (game.phase === 'ai' ? 'ai' : 'player');
}

function getControlledTank(game) {
  if (!game) return null;
  const targetId = game.isPvp ? (game.activeTeam || 'player1') : 'player';
  return game.tanks.find((t) => t.id === targetId) || null;
}

function resolveTankSelection(tankTypeId, armorId) {
  const armor = ARMOR_CATALOG[armorId] || ARMOR_CATALOG.medium;
  const tankType = TANK_TYPES_CATALOG[tankTypeId] || TANK_TYPES_CATALOG.artillery;
  const turret = TURRET_CATALOG[tankType.turretId];
  return { tankType, armor, turret };
}

function createPvpMatch(config) {
  const mapStyle = config.mapStyle || 'bunkers';
  const mapSeed = Number.isFinite(Number(config.mapSeed)) && Number(config.mapSeed) > 0
    ? (Number(config.mapSeed) >>> 0)
    : ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  const grid = generateArena(mapStyle, mapSeed);
  const p1 = resolveTankSelection(config.p1TankTypeId, config.p1ArmorId);
  const p2 = resolveTankSelection(config.p2TankTypeId, config.p2ArmorId);
  const sameColor = p1.tankType.color === p2.tankType.color;

  const p1Tank = createTankEntity({
    id: 'player1',
    name: config.p1Name || `J1 (${p1.tankType.name})`,
    team: 'player1',
    tankType: p1.tankType,
    armor: p1.armor,
    turret: p1.turret,
    x: 8,
    y: 34,
    dir: 0,
    hp: p1.armor.maxHp,
    moveAp: p1.armor.moveAp,
    color: p1.tankType.color,
    accent: p1.tankType.accent
  });

  const p2Tank = createTankEntity({
    id: 'player2',
    name: config.p2Name || `J2 (${p2.tankType.name})`,
    team: 'player2',
    tankType: p2.tankType,
    armor: p2.armor,
    turret: p2.turret,
    x: 108,
    y: 34,
    dir: Math.PI,
    hp: p2.armor.maxHp,
    moveAp: p2.armor.moveAp,
    color: sameColor ? '#fb7185' : p2.tankType.color,
    accent: sameColor ? '#9f1239' : p2.tankType.accent
  });

  return {
    mode: config.mode || 'pvp_adhoc',
    isPvp: true,
    difficulty: 'pvp',
    mapStyle,
    turnNumber: 1,
    phase: 'player',
    activeTeam: 'player1',
    activeControl: 'player1',
    winner: null,
    endingTurn: false,
    nextEntityId: 1,
    grid,
    tanks: [p1Tank, p2Tank],
    hazards: [],
    deployables: [],
    logs: [
      `Duelo PvP iniciado (${mapStyle}): ${p1Tank.name} vs ${p2Tank.name}. Turno de J1.`
    ]
  };
}

function createMatch(config) {
  const diff = DIFFICULTY_CONFIG[config.difficulty] || DIFFICULTY_CONFIG.normal;
  const armor = ARMOR_CATALOG[config.armorId || config.chassisId] || ARMOR_CATALOG.medium;
  const tankType = TANK_TYPES_CATALOG[config.tankTypeId] ||
    Object.values(TANK_TYPES_CATALOG).find((t) => t.turretId === config.turretId) ||
    TANK_TYPES_CATALOG.artillery;
  const turret = TURRET_CATALOG[tankType.turretId];
  const mapSeed = Number.isFinite(Number(config.mapSeed)) && Number(config.mapSeed) > 0
    ? (Number(config.mapSeed) >>> 0)
    : ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  const grid = generateArena(config.mapStyle || 'bunkers', mapSeed);

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
    mode: 'pve',
    isPvp: false,
    difficulty: diff.id,
    mapStyle: config.mapStyle || 'bunkers',
    turnNumber: 1,
    phase: 'player',
    activeTeam: 'player',
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
  if (game.isPvp) {
    const p1 = game.tanks.find((t) => t.id === 'player1');
    const p2 = game.tanks.find((t) => t.id === 'player2');
    const p1Alive = Boolean(p1 && p1.alive);
    const p2Alive = Boolean(p2 && p2.alive);
    if (!p1Alive && !p2Alive) {
      game.phase = 'gameover';
      game.winner = 'draw';
      game.logs.unshift(`¡Doble destrucción en ${game.turnNumber} turnos! Empate.`);
      return true;
    }
    if (!p1Alive) {
      game.phase = 'gameover';
      game.winner = 'player2';
      game.logs.unshift(`¡${p2.name} gana el duelo en ${game.turnNumber} turnos!`);
      return true;
    }
    if (!p2Alive) {
      game.phase = 'gameover';
      game.winner = 'player1';
      game.logs.unshift(`¡${p1.name} gana el duelo en ${game.turnNumber} turnos!`);
      return true;
    }
    return false;
  }

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

function serializeState(game, viewerTeam = 'player') {
  return {
    type: 'state',
    mode: game.mode || 'pve',
    isPvp: Boolean(game.isPvp),
    gridW: GRID_W,
    gridH: GRID_H,
    tankSize: TANK_SIZE,
    difficulty: game.difficulty,
    mapStyle: game.mapStyle,
    turnNumber: game.turnNumber,
    phase: game.phase,
    activeTeam: game.activeTeam || 'player',
    activeControl: game.activeControl || 'player',
    myTeam: viewerTeam,
    winner: game.winner,
    grid: serializeGrid(game.grid),
    tanks: game.tanks,
    hazards: serializeHazardsForPlayer(game, viewerTeam),
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
      const dmg = applyTankDamage(target, tur.damage);

      game.logs.unshift(`${tur.name} dispara a ${target.name} (-${dmg} PV${!target.alive ? ' ¡DESTRUIDO!' : ''})`);
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
              damage: dmg,
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

/** Collects all grid coordinates reachable within maxSteps on walkable using BFS. */
function collectReachableCells(walkable, startX, startY, maxSteps) {
  const height = walkable.length;
  const width = height > 0 ? walkable[0].length : 0;
  const nodes = [{ x: startX, y: startY, steps: 0, parentIdx: -1 }];
  if (maxSteps <= 0 || height === 0 || width === 0) return nodes;

  const visited = new Set([`${startX},${startY}`]);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  let head = 0;
  while (head < nodes.length) {
    const cur = nodes[head];
    if (cur.steps < maxSteps) {
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (!walkable[ny]?.[nx]) continue;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        visited.add(key);
        nodes.push({ x: nx, y: ny, steps: cur.steps + 1, parentIdx: head });
      }
    }
    head++;
  }
  return nodes;
}

/** Reconstructs step sequence from BFS node index back to root (excluding start). */
function reconstructBfsPath(nodes, targetIdx) {
  const path = [];
  let idx = targetIdx;
  while (idx > 0) {
    const n = nodes[idx];
    path.push({ x: n.x, y: n.y });
    idx = n.parentIdx;
  }
  path.reverse();
  return path;
}

/** Selects the closest visible deployable, breaking near ties in favor of drones. */
function pickPreferredVisibleDeployable(ai, visibleDeps) {
  const ox = ai.x + TANK_SIZE / 2;
  const oy = ai.y + TANK_SIZE / 2;
  let best = visibleDeps[0];
  let bestScore = Infinity;
  for (const dep of visibleDeps) {
    const size = dep.size || TANK_SIZE;
    const dist = Math.hypot(dep.x + size / 2 - ox, dep.y + size / 2 - oy);
    const kindBonus = dep.kind === 'drone' ? -2 : 0;
    const score = dist + kindBonus;
    if (score < bestScore) {
      bestScore = score;
      best = dep;
    }
  }
  return best;
}

/** Picks movement steps while staying outside active enemy drones' line of sight when possible. */
function chooseAIMovementSteps(game, ai, walkable, maxSteps, bestPath, player, activeEnemyDeps, activeEnemyDrones) {
  if (activeEnemyDrones.length === 0) {
    return bestPath && bestPath.length > 0 ? bestPath.slice(0, maxSteps) : [];
  }

  const nodes = collectReachableCells(walkable, ai.x, ai.y, maxSteps);
  const goalAnchor =
    bestPath && bestPath.length > 0
      ? bestPath[Math.min(bestPath.length - 1, Math.max(0, maxSteps - 1))]
      : { x: player.x, y: player.y };

  let bestIdx = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const exposedToDrone = activeEnemyDrones.some((dr) =>
      isTankExposedToObserverAt(game.grid, game.tanks, dr, ai.id, node.x, node.y, activeEnemyDeps)
    );

    const aiProxy = { ...ai, x: node.x, y: node.y };
    const tanksAtPos = game.tanks.map((t) => (t.id === ai.id ? aiProxy : t));
    const canSeePlayer = hasLineOfSightToEntity(game.grid, tanksAtPos, aiProxy, player, activeEnemyDeps);
    const canSeeDep = activeEnemyDeps.some((d) =>
      hasLineOfSightToEntity(game.grid, tanksAtPos, aiProxy, d, activeEnemyDeps)
    );

    const distAnchor = Math.hypot(node.x - goalAnchor.x, node.y - goalAnchor.y);
    const distPlayer = Math.hypot(node.x - player.x, node.y - player.y);

    const score =
      (!exposedToDrone ? 100000 : 0) +
      (canSeePlayer ? 25000 : 0) +
      (canSeeDep ? 4000 : 0) -
      distAnchor * 30 -
      distPlayer * 2 -
      node.steps * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return reconstructBfsPath(nodes, bestIdx);
}

async function runAITurn(game, sendMessage, isActive) {
  const diff = DIFFICULTY_CONFIG[game.difficulty] || DIFFICULTY_CONFIG.normal;
  const player = game.tanks.find((t) => t.id === 'player');
  const aiTanks = game.tanks.filter((t) => t.team === 'ai' && t.alive);
  armTeamTraps(game, 'ai');

  for (const ai of aiTanks) {
    if (!isActive() || game.phase === 'gameover') return;

    ai.rageActive = false;
    ai.rageDamageReduction = 0;
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

    const activeEnemyDeps = (game.deployables || []).filter(
      (d) => d.hp > 0 && d.team !== ai.team
    );
    const activeEnemyDrones = activeEnemyDeps.filter((d) => d.kind === 'drone');

    const hasTankLOSStart = hasLineOfSightToEntity(
      game.grid,
      game.tanks,
      ai,
      player,
      activeEnemyDeps
    );
    const visibleDepsStart = activeEnemyDeps.filter((d) =>
      hasLineOfSightToEntity(game.grid, game.tanks, ai, d, activeEnemyDeps)
    );
    const hasTargetInSightStart = hasTankLOSStart || visibleDepsStart.length > 0;

    if (!hasTargetInSightStart) {
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

      const maxSteps = game.difficulty === 'easy'
        ? Math.max(4, Math.floor(ai.moveAp * 0.65))
        : ai.moveAp;
      const plannedSteps = chooseAIMovementSteps(
        game,
        ai,
        walkable,
        maxSteps,
        bestPath,
        player,
        activeEnemyDeps,
        activeEnemyDrones
      );

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

    const enemyDepsNow = (game.deployables || []).filter(
      (d) => d.hp > 0 && d.team !== ai.team
    );
    const losPlayerNow = hasLineOfSightToEntity(
      game.grid,
      game.tanks,
      ai,
      player,
      enemyDepsNow
    );
    const visibleDepsNow = enemyDepsNow.filter((d) =>
      hasLineOfSightToEntity(game.grid, game.tanks, ai, d, enemyDepsNow)
    );

    let targetEntity = player;
    let losNow = losPlayerNow;
    if (!losPlayerNow && visibleDepsNow.length > 0) {
      targetEntity = pickPreferredVisibleDeployable(ai, visibleDepsNow);
      losNow = true;
    }

    const ox = ai.x + TANK_SIZE / 2;
    const oy = ai.y + TANK_SIZE / 2;
    const targetSize = targetEntity.size || TANK_SIZE;
    const px = targetEntity.x + targetSize / 2;
    const py = targetEntity.y + targetSize / 2;
    const directAngle = Math.atan2(py - oy, px - ox);
    const distNow = Math.hypot(px - ox, py - oy);

    let chosenMode = 'normal';
    const targetingDeployable = targetEntity !== player;
    const canSpecial1 = !targetingDeployable && !aiSuppressed && ai.specialCooldown === 0;
    const canSpecial2 = !targetingDeployable && !aiSuppressed && (ai.special2Cooldown === 0 || ai.chargedReady);
    if (!targetingDeployable && !aiSuppressed && ai.chargedReady) {
      chosenMode = 'special2';
    } else if (canSpecial1 && Math.random() < diff.useSpecialChance) {
      if (ai.turretId === 'mortar' && distNow <= TURRET_CATALOG.mortar.range) {
        chosenMode = 'special';
      } else if (ai.turretId === 'shotgun' && distNow <= 38) {
        chosenMode = 'special';
      } else if (ai.turretId === 'bloodsucker' && distNow <= TURRET_CATALOG.bloodsucker.range) {
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
        game.deployables = (game.deployables || []).filter((d) => d.hp > 0);
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
  if (player) {
    player.rageActive = false;
    player.rageDamageReduction = 0;
  }
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

async function advancePvpTurn(game, sendMessage, isActive, skipDelayMs = 800, stunDepth = 0) {
  if (!game || !game.isPvp || game.phase !== 'player' || game.endingTurn) return;
  const prevTeam = game.activeTeam || 'player1';
  const prevTank = game.tanks.find((t) => t.id === prevTeam);

  if (prevTank && prevTank.trapBurstRemaining > 0) {
    prevTank.trapBurstRemaining = 0;
    prevTank.special2Cooldown = SPECIAL2_CATALOG.trap.cooldown;
  }
  if (prevTank) {
    if (!prevTank.wasStunnedThisTurn && (prevTank.silencedTurns || 0) > 0) {
      prevTank.silencedTurns -= 1;
    }
    prevTank.wasStunnedThisTurn = false;
  }

  game.endingTurn = true;
  await runDeployableTurrets(game, prevTeam, sendMessage, isActive);
  if (!isActive() || game.phase === 'gameover') {
    game.endingTurn = false;
    return;
  }

  const nextTeam = prevTeam === 'player1' ? 'player2' : 'player1';
  if (nextTeam === 'player1') {
    tickMolotovZones(game, sendMessage);
    if (checkGameOver(game)) {
      game.endingTurn = false;
      sendMessage({ type: 'sync_state' });
      return;
    }
    game.turnNumber += 1;
  }

  const nextTank = game.tanks.find((t) => t.id === nextTeam);
  game.activeTeam = nextTeam;
  game.activeControl = nextTeam;
  game.endingTurn = false;

  if (!nextTank || !nextTank.alive) {
    checkGameOver(game);
    sendMessage({ type: 'sync_state' });
    return;
  }

  nextTank.rageActive = false;
  nextTank.rageDamageReduction = 0;
  armTeamTraps(game, nextTeam);
  applyTurnStartPoison(game, nextTank, sendMessage);
  if (checkGameOver(game)) {
    sendMessage({ type: 'sync_state' });
    return;
  }

  nextTank.trapBurstRemaining = 0;
  if (nextTank.specialCooldown > 0) nextTank.specialCooldown--;
  if (nextTank.special2Cooldown > 0 && !nextTank.chargedReady) nextTank.special2Cooldown--;

  for (const d of game.deployables) {
    if (d.kind === 'drone' && d.ownerId === nextTank.id && d.hp > 0) {
      d.moveAp = d.maxMoveAp;
      d.canShoot = true;
      if ((d.droneSpecial2Cooldown || 0) > 0) d.droneSpecial2Cooldown--;
    }
  }

  if ((nextTank.stunnedTurns || 0) > 0 && stunDepth < 4) {
    nextTank.stunnedTurns -= 1;
    const isEmpStun = nextTank.stunReason === 'emp';
    nextTank.stunReason = null;
    nextTank.wasStunnedThisTurn = true;
    nextTank.moveAp = 0;
    nextTank.canShoot = false;
    if (nextTank.slowedTurns > 0) nextTank.slowedTurns--;
    game.logs.unshift(
      isEmpStun
        ? `⚡ ${nextTank.name} está aturdido por PEM y pierde este turno.`
        : `❄️ ${nextTank.name} está congelado y pierde este turno.`
    );
    sendMessage({ type: 'sync_state' });
    sendMessage({
      type: 'toast',
      message: `${nextTank.name} pierde el turno por ${isEmpStun ? 'PEM' : 'Congelación'}.`
    });
    if (skipDelayMs > 0) await delay(skipDelayMs);
    if (isActive() && game.phase === 'player' && !game.endingTurn && nextTank.alive) {
      await advancePvpTurn(game, sendMessage, isActive, skipDelayMs, stunDepth + 1);
    }
    return;
  }

  nextTank.wasStunnedThisTurn = false;
  nextTank.moveAp = computeTurnMoveAp(nextTank);
  if (nextTank.slowedTurns > 0) nextTank.slowedTurns--;
  if (nextTank.empSlowTurns > 0) nextTank.empSlowTurns--;
  nextTank.canShoot = true;
  game.logs.unshift(`--- Turno ${game.turnNumber}: Turno de ${nextTank.name} ---`);
  sendMessage({ type: 'sync_state' });
}

module.exports = {
  delay,
  createMatch,
  createPvpMatch,
  getGameActiveTeam,
  getControlledTank,
  checkGameOver,
  serializeGrid,
  serializeState,
  runDeployableTurrets,
  beginAITurn,
  runAITurn,
  advancePvpTurn
};
