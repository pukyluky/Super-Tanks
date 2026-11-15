const { TANK_SIZE } = require('../config/constants');
const { TURRET_CATALOG } = require('../data/specials1');
const { SPECIAL2_CATALOG } = require('../data/specials2');
const { applyTankDamage, applyRadialWallDamage, applyRadialTankDamage } = require('./physics');

function serializeHazardsForPlayer(game, viewerTeam = 'player') {
  return game.hazards
    .filter((h) => !(h.kind === 'trap' && h.team !== viewerTeam))
    .map((h) => ({
      id: h.id,
      kind: h.kind,
      team: h.team,
      x: h.x,
      y: h.y,
      radius: h.radius,
      angle: h.angle,
      length: h.length,
      thickness: h.thickness,
      turnsLeft: h.turnsLeft,
      armingTurns: h.armingTurns || 0
    }));
}

function armTeamTraps(game, team) {
  for (const h of game.hazards) {
    if (h.kind === 'trap' && h.team === team && (h.armingTurns || 0) > 0) {
      h.armingTurns -= 1;
    }
  }
}

function isTankTouchingCircle(tank, cx, cy, radius) {
  const nx = Math.max(tank.x, Math.min(cx, tank.x + TANK_SIZE));
  const ny = Math.max(tank.y, Math.min(cy, tank.y + TANK_SIZE));
  return Math.hypot(nx - cx, ny - cy) <= radius;
}

function isTankTouchingOrientedRect(tank, cx, cy, angle, length, thickness) {
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  const px = -fy;
  const py = fx;
  for (let ty = 0; ty < TANK_SIZE; ty++) {
    for (let tx = 0; tx < TANK_SIZE; tx++) {
      const dx = tank.x + tx + 0.5 - cx;
      const dy = tank.y + ty + 0.5 - cy;
      const u = dx * px + dy * py;
      const v = dx * fx + dy * fy;
      if (Math.abs(u) <= length / 2 && Math.abs(v) <= thickness / 2) {
        return true;
      }
    }
  }
  return false;
}

function isTankTouchingHazard(tank, hz) {
  if (hz.kind === 'fire_wall') {
    return isTankTouchingOrientedRect(tank, hz.x, hz.y, hz.angle, hz.length, hz.thickness);
  }
  return isTankTouchingCircle(tank, hz.x, hz.y, hz.radius);
}

function processMovementWithHazards(game, tank, steps) {
  const takenSteps = [];
  const hazardEvents = [];
  let maxStepsAllowed = steps.length;

  for (let i = 0; i < steps.length && i < maxStepsAllowed; i++) {
    const st = steps[i];
    const prevX = tank.x;
    const prevY = tank.y;
    tank.x = st.x;
    tank.y = st.y;
    tank.dir = Math.atan2(st.y - prevY, st.x - prevX);
    tank.moveAp = Math.max(0, tank.moveAp - 1);
    takenSteps.push({ x: st.x, y: st.y });

    if (tank.kind === 'drone') continue;

    for (let hi = game.hazards.length - 1; hi >= 0; hi--) {
      const hz = game.hazards[hi];
      if (!isTankTouchingHazard(tank, hz)) continue;

      if (hz.kind === 'mine' && hz.team !== tank.team) {
        game.hazards.splice(hi, 1);
        const damagedCells = applyRadialWallDamage(game.grid, hz.x, hz.y, hz.blastRadius, 3, 0.7);
        const tankHits = applyRadialTankDamage(game.tanks, hz.x, hz.y, hz.blastRadius, hz.damage, 16, game.deployables);
        game.logs.unshift(`¡Mina Terrestre detonada por ${tank.name}! (-${hz.damage} PV)`);
        hazardEvents.push({
          kind: 'mine',
          x: hz.x,
          y: hz.y,
          radius: hz.blastRadius,
          damagedCells,
          tankHits
        });
        maxStepsAllowed = i + 1;
        break;
      }

      if (hz.kind === 'trap' && hz.team !== tank.team && (hz.armingTurns || 0) <= 0) {
        game.hazards.splice(hi, 1);
        const dmg = applyTankDamage(tank, hz.damage);
        tank.slowedTurns = Math.max(tank.slowedTurns, 1);
        tank.moveAp = Math.floor(tank.moveAp * (1 - hz.slowPercent));
        maxStepsAllowed = Math.min(maxStepsAllowed, i + 1 + tank.moveAp);
        game.logs.unshift(`¡Trampa Invisible activada por ${tank.name}! -${dmg} PV y -35% movimiento.`);
        hazardEvents.push({
          kind: 'trap',
          x: hz.x,
          y: hz.y,
          radius: 2.0,
          damagedCells: [],
          tankHits: [
            {
              tankId: tank.id,
              tankName: tank.name,
              damage: dmg,
              remainingHp: tank.hp,
              destroyed: !tank.alive,
              x: tank.x + TANK_SIZE / 2,
              y: tank.y + TANK_SIZE / 2
            }
          ]
        });
      }

      const isZoneDot =
        hz.kind === 'molotov' ||
        ((hz.kind === 'poison' || hz.kind === 'fire_pool' || hz.kind === 'fire_wall') && hz.team !== tank.team);
      if (isZoneDot && !hz.hitThisTurn.includes(tank.id)) {
        hz.hitThisTurn.push(tank.id);
        const rawZoneDmg = hz.kind === 'molotov' ? SPECIAL2_CATALOG.molotov.burnDamage : hz.damage;
        const zoneDmg = applyTankDamage(tank, rawZoneDmg);
        const zoneLabel = hz.kind === 'poison'
          ? 'un charco tóxico'
          : hz.kind === 'fire_pool'
            ? 'un charco de fuego'
            : hz.kind === 'fire_wall'
              ? 'el Muro de Fuego'
              : 'Molotov';
        game.logs.unshift(`¡${tank.name} sufre daño por ${zoneLabel}! (-${zoneDmg} PV)`);
        hazardEvents.push({
          kind: hz.kind,
          x: tank.x + TANK_SIZE / 2,
          y: tank.y + TANK_SIZE / 2,
          radius: 2.0,
          damagedCells: [],
          tankHits: [
            {
              tankId: tank.id,
              tankName: tank.name,
              damage: zoneDmg,
              remainingHp: tank.hp,
              destroyed: !tank.alive,
              x: tank.x + TANK_SIZE / 2,
              y: tank.y + TANK_SIZE / 2
            }
          ]
        });
      }
    }

    if (!tank.alive) break;
  }

  game.deployables = game.deployables.filter((d) => d.hp > 0);
  return { takenSteps, hazardEvents };
}

function tickMolotovZones(game, sendMessage) {
  const zoneKinds = new Set(['molotov', 'poison', 'fire_pool', 'fire_wall']);
  const zoneHits = [];
  let hitKind = 'molotov';
  for (let i = game.hazards.length - 1; i >= 0; i--) {
    const hz = game.hazards[i];
    if (!zoneKinds.has(hz.kind)) continue;
    hz.hitThisTurn = [];
    for (const tank of game.tanks) {
      if (!tank.alive) continue;
      if (hz.kind !== 'molotov' && tank.team === hz.team) continue;
      if (isTankTouchingHazard(tank, hz)) {
        const rawDmg = hz.kind === 'molotov' ? SPECIAL2_CATALOG.molotov.burnDamage : hz.damage;
        const dmg = applyTankDamage(tank, rawDmg);
        hz.hitThisTurn.push(tank.id);
        hitKind = hz.kind;
        zoneHits.push({
          tankId: tank.id,
          tankName: tank.name,
          damage: dmg,
          remainingHp: tank.hp,
          destroyed: !tank.alive,
          x: tank.x + TANK_SIZE / 2,
          y: tank.y + TANK_SIZE / 2
        });
        const label = hz.kind === 'poison'
          ? 'Charco tóxico'
          : hz.kind === 'fire_pool'
            ? 'Charco de fuego'
            : hz.kind === 'fire_wall'
              ? 'Muro de Fuego'
              : 'Fuego de Molotov';
        game.logs.unshift(`${label} daña a ${tank.name} (-${dmg} PV).`);
      }
    }
    hz.turnsLeft -= 1;
    if (hz.turnsLeft <= 0) {
      game.hazards.splice(i, 1);
    }
  }

  if (zoneHits.length > 0) {
    sendMessage({
      type: 'hazard_triggered',
      hazards: serializeHazardsForPlayer(game),
      deployables: game.deployables,
      tanks: game.tanks,
      events: {
        kind: hitKind,
        x: zoneHits[0].x,
        y: zoneHits[0].y,
        radius: 2.2,
        damagedCells: [],
        tankHits: zoneHits
      },
      logs: game.logs.slice(0, 12)
    });
  }
}

function applySingleDoT(game, tank, sendMessage, turnsKey, dmgKey, defaultDmg, fxKind, label) {
  if (!tank || !tank.alive || (tank[turnsKey] || 0) <= 0) return;
  const dmg = applyTankDamage(tank, tank[dmgKey] || defaultDmg);
  tank[turnsKey] -= 1;
  if (tank[turnsKey] <= 0) {
    tank[turnsKey] = 0;
    tank[dmgKey] = 0;
  }
  game.logs.unshift(`${label} daña a ${tank.name} (-${dmg} PV${!tank.alive ? ' ¡DESTRUIDO!' : `, quedan ${tank[turnsKey]}t`}).`);
  sendMessage({
    type: 'hazard_triggered',
    hazards: serializeHazardsForPlayer(game),
    deployables: game.deployables,
    tanks: game.tanks,
    events: {
      kind: fxKind,
      x: tank.x + TANK_SIZE / 2,
      y: tank.y + TANK_SIZE / 2,
      radius: 2.0,
      damagedCells: [],
      tankHits: [
        {
          tankId: tank.id,
          tankName: tank.name,
          damage: dmg,
          remainingHp: tank.hp,
          destroyed: !tank.alive,
          x: tank.x + TANK_SIZE / 2,
          y: tank.y + TANK_SIZE / 2
        }
      ]
    },
    logs: game.logs.slice(0, 12)
  });
}

function applyTurnStartPoison(game, tank, sendMessage) {
  applySingleDoT(game, tank, sendMessage, 'poisonTurns', 'poisonDamage', TURRET_CATALOG.toxic.poisonDamage, 'toxic', 'Veneno');
  applySingleDoT(game, tank, sendMessage, 'burnTurns', 'burnDamage', TURRET_CATALOG.fire_shot.burnDamage, 'fire_shot', 'Fuego');
}

function computeTurnMoveAp(tank) {
  let mult = 1;
  if ((tank.slowedTurns || 0) > 0) mult *= 0.65;
  if ((tank.empSlowTurns || 0) > 0) mult *= 0.75;
  return Math.max(1, Math.round(tank.maxMoveAp * mult));
}

module.exports = {
  serializeHazardsForPlayer,
  armTeamTraps,
  isTankTouchingCircle,
  isTankTouchingOrientedRect,
  isTankTouchingHazard,
  processMovementWithHazards,
  tickMolotovZones,
  applySingleDoT,
  applyTurnStartPoison,
  computeTurnMoveAp
};
