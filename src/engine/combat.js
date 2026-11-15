const {
  GRID_W,
  GRID_H,
  TANK_SIZE,
  CELL_STEEL
} = require('../config/constants');
const { TURRET_CATALOG } = require('../data/specials1');
const { SPECIAL2_CATALOG } = require('../data/specials2');
const {
  intersectRayAABB,
  raycastWallDDA,
  findClosestTankHit,
  findNearestEmptyPoint,
  computeOutgoingDamage,
  applyTankDamage,
  applyRadialWallDamage,
  applyRadialTankDamage,
  buildWallBarricade
} = require('./physics');
const { isTankTouchingHazard } = require('./hazards');

function resolveShot(game, shooter, mode, angle, targetX, targetY) {
  const turret = TURRET_CATALOG[shooter.turretId];
  const sp2 = SPECIAL2_CATALOG[shooter.special2Id];
  const ox = shooter.x + (shooter.size || TANK_SIZE) / 2;
  const oy = shooter.y + (shooter.size || TANK_SIZE) / 2;

  const events = {
    shooterId: shooter.id,
    aimAngle: angle,
    weaponMode: mode,
    turretId: shooter.turretId,
    traces: [],
    explosions: [],
    damagedCells: [],
    tankHits: [],
    heals: []
  };

  const mergeCellChanges = (changes) => {
    for (const c of changes) {
      events.damagedCells.push(c);
    }
  };

  const recordTankDirectHit = (tank, rawDmg, hx, hy) => {
    const dealt = applyTankDamage(tank, rawDmg);
    events.tankHits.push({
      tankId: tank.id,
      tankName: tank.name,
      damage: dealt,
      remainingHp: tank.hp,
      destroyed: !tank.alive,
      x: hx,
      y: hy
    });
    return dealt;
  };

  const recordTargetHit = (hit, rawDmg, hx, hy) => {
    if (hit.kind === 'deployable') {
      const dep = hit.deployable;
      dep.hp = Math.max(0, dep.hp - 1);
      events.tankHits.push({
        tankId: dep.id,
        tankName: dep.name,
        damage: 1,
        remainingHp: dep.hp,
        destroyed: dep.hp === 0,
        x: hx,
        y: hy
      });
      return 0;
    }
    return recordTankDirectHit(hit.tank, rawDmg, hx, hy);
  };

  const fireShotgunFan = (pellets, spreadDeg, range, pelletDamage, wallRadius, kind) => {
    const scaledPelletDmg = computeOutgoingDamage(shooter, pelletDamage);
    const halfSpread = ((spreadDeg * Math.PI) / 180) / 2;
    let totalTankDamage = 0;
    for (let i = 0; i < pellets; i++) {
      const offset = pellets === 1 ? 0 : -halfSpread + (i / (pellets - 1)) * halfSpread * 2;
      const a = angle + offset;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const wallHit = raycastWallDDA(game.grid, ox, oy, dx, dy, range);
      const targetHit = findClosestTankHit(game.tanks, ox, oy, dx, dy, wallHit.t, shooter.id, game.deployables);

      if (targetHit) {
        events.traces.push({ x1: ox, y1: oy, x2: targetHit.x, y2: targetHit.y, kind });
        events.explosions.push({ x: targetHit.x, y: targetHit.y, radius: 1.4, kind });
        totalTankDamage += recordTargetHit(targetHit, scaledPelletDmg, targetHit.x, targetHit.y);
      } else {
        events.traces.push({ x1: ox, y1: oy, x2: wallHit.x, y2: wallHit.y, kind });
        events.explosions.push({ x: wallHit.x, y: wallHit.y, radius: 1.5, kind });
        if (wallHit.hit) {
          mergeCellChanges(applyRadialWallDamage(game.grid, wallHit.x, wallHit.y, wallRadius, 2, 0.7));
        }
      }
    }
    return totalTankDamage;
  };

  // MODO NORMAL: Cañón estándar 360°, escopeta corta (NetRunner) o tiro de dron (20 PV)
  if (mode === 'normal') {
    if (shooter.kind === 'drone') {
      const droneDmg = TURRET_CATALOG.drone.droneShotDamage;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const wallHit = raycastWallDDA(game.grid, ox, oy, dx, dy, 180);
      const targetHit = findClosestTankHit(game.tanks, ox, oy, dx, dy, wallHit.t, shooter.id, game.deployables);
      if (targetHit) {
        events.traces.push({ x1: ox, y1: oy, x2: targetHit.x, y2: targetHit.y, kind: 'drone_shot' });
        events.explosions.push({ x: targetHit.x, y: targetHit.y, radius: 1.9, kind: 'drone_shot' });
        recordTargetHit(targetHit, droneDmg, targetHit.x, targetHit.y);
        mergeCellChanges(applyRadialWallDamage(game.grid, targetHit.x, targetHit.y, 1.4, 1, 0.8));
      } else {
        events.traces.push({ x1: ox, y1: oy, x2: wallHit.x, y2: wallHit.y, kind: 'drone_shot' });
        events.explosions.push({ x: wallHit.x, y: wallHit.y, radius: 1.9, kind: 'drone_shot' });
        if (wallHit.hit) {
          mergeCellChanges(applyRadialWallDamage(game.grid, wallHit.x, wallHit.y, 1.8, 2, 0.9));
        }
      }
      return events;
    }

    if (shooter.basicWeapon === 'short_shotgun') {
      fireShotgunFan(4, 28, 22, 7, 1.3, 'short_shotgun');
      return events;
    }

    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const wallHit = raycastWallDDA(game.grid, ox, oy, dx, dy, 180);
    const targetHit = findClosestTankHit(game.tanks, ox, oy, dx, dy, wallHit.t, shooter.id, game.deployables);

    if (targetHit) {
      events.traces.push({ x1: ox, y1: oy, x2: targetHit.x, y2: targetHit.y, kind: 'standard' });
      events.explosions.push({ x: targetHit.x, y: targetHit.y, radius: 2.0, kind: 'standard' });
      recordTargetHit(targetHit, computeOutgoingDamage(shooter, 24), targetHit.x, targetHit.y);
      mergeCellChanges(applyRadialWallDamage(game.grid, targetHit.x, targetHit.y, 1.8, 2, 0.8));
    } else {
      events.traces.push({ x1: ox, y1: oy, x2: wallHit.x, y2: wallHit.y, kind: 'standard' });
      events.explosions.push({ x: wallHit.x, y: wallHit.y, radius: 2.2, kind: 'standard' });
      if (wallHit.hit) {
        mergeCellChanges(applyRadialWallDamage(game.grid, wallHit.x, wallHit.y, 2.2, 3, 0.9));
      }
    }
    return events;
  }

  // MODO ESPECIAL 2
  if (mode === 'special2' && sp2) {
    if (sp2.id === 'rage') {
      if (shooter.rageActive || !(shooter.hp < shooter.maxHp * sp2.maxHpPercent)) {
        return events;
      }
      shooter.rageActive = true;
      shooter.rageDamageReduction = sp2.damageReduction;
      shooter.special2Cooldown = sp2.cooldown;
      const bonusAp = Math.max(1, Math.round((shooter.maxMoveAp || 1) * sp2.moveBonusPercent));
      shooter.moveAp = (shooter.moveAp || 0) + bonusAp;
      events.rageBonusAp = bonusAp;
      events.explosions.push({ x: ox, y: oy, radius: 3.0, kind: 'rage' });
      return events;
    }

    if (sp2.id === 'charged_shot') {
      if (!shooter.chargedReady) {
        shooter.chargedReady = true;
        events.explosions.push({ x: ox, y: oy, radius: 2.4, kind: 'charge_up' });
        return events;
      }
      shooter.chargedReady = false;
      shooter.special2Cooldown = sp2.cooldown;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const wallHit = raycastWallDDA(game.grid, ox, oy, dx, dy, 180);
      const targetHit = findClosestTankHit(game.tanks, ox, oy, dx, dy, wallHit.t, shooter.id, game.deployables);

      if (targetHit) {
        events.traces.push({ x1: ox, y1: oy, x2: targetHit.x, y2: targetHit.y, kind: 'charged' });
        events.explosions.push({ x: targetHit.x, y: targetHit.y, radius: sp2.blastRadius, kind: 'charged' });
        recordTargetHit(targetHit, sp2.damage, targetHit.x, targetHit.y);
        mergeCellChanges(applyRadialWallDamage(game.grid, targetHit.x, targetHit.y, sp2.blastRadius, 4, 0.7));
      } else {
        events.traces.push({ x1: ox, y1: oy, x2: wallHit.x, y2: wallHit.y, kind: 'charged' });
        events.explosions.push({ x: wallHit.x, y: wallHit.y, radius: sp2.blastRadius, kind: 'charged' });
        if (wallHit.hit) {
          mergeCellChanges(applyRadialWallDamage(game.grid, wallHit.x, wallHit.y, sp2.blastRadius, 4, 0.7));
        }
      }
      return events;
    }

    if (sp2.id === 'freeze_shot') {
      shooter.special2Cooldown = sp2.cooldown;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const wallHit = raycastWallDDA(game.grid, ox, oy, dx, dy, 180);
      const targetHit = findClosestTankHit(game.tanks, ox, oy, dx, dy, wallHit.t, shooter.id, game.deployables);

      if (targetHit) {
        events.traces.push({ x1: ox, y1: oy, x2: targetHit.x, y2: targetHit.y, kind: 'freeze' });
        events.explosions.push({ x: targetHit.x, y: targetHit.y, radius: 2.2, kind: 'freeze' });
        recordTargetHit(targetHit, sp2.damage, targetHit.x, targetHit.y);
        if (targetHit.kind === 'tank' && targetHit.tank.alive) {
          targetHit.tank.stunnedTurns = Math.max(targetHit.tank.stunnedTurns || 0, sp2.stunTurns);
          targetHit.tank.stunReason = 'freeze';
        }
      } else {
        events.traces.push({ x1: ox, y1: oy, x2: wallHit.x, y2: wallHit.y, kind: 'freeze' });
        events.explosions.push({ x: wallHit.x, y: wallHit.y, radius: 1.8, kind: 'freeze' });
      }
      return events;
    }

    shooter.special2Cooldown = sp2.cooldown;
    const reqDist = Math.hypot((targetX ?? ox + Math.cos(angle) * 20) - ox, (targetY ?? oy + Math.sin(angle) * 20) - oy);
    const clampedDist = Math.max(5, Math.min(sp2.range, reqDist));
    const ix = Math.max(3, Math.min(GRID_W - 3, ox + Math.cos(angle) * clampedDist));
    const iy = Math.max(3, Math.min(GRID_H - 3, oy + Math.sin(angle) * clampedDist));

    if (sp2.id === 'molotov') {
      events.traces.push({ x1: ox, y1: oy, x2: ix, y2: iy, kind: 'molotov' });
      events.explosions.push({ x: ix, y: iy, radius: sp2.radius, kind: 'molotov' });
      game.hazards.push({
        id: `haz_${++game.nextEntityId}`,
        kind: 'molotov',
        team: shooter.team,
        x: ix,
        y: iy,
        radius: sp2.radius,
        turnsLeft: sp2.duration,
        hitThisTurn: []
      });
      const impactHits = applyRadialTankDamage(game.tanks, ix, iy, sp2.radius, sp2.impactDamage, 8, game.deployables);
      events.tankHits.push(...impactHits);
      return events;
    }

    if (sp2.id === 'landmine') {
      const spot = findNearestEmptyPoint(game.grid, game.tanks, ix, iy, 1, 6);
      const mx = spot ? spot.x + 0.5 : ix;
      const my = spot ? spot.y + 0.5 : iy;
      events.traces.push({ x1: ox, y1: oy, x2: mx, y2: my, kind: 'mine' });
      events.explosions.push({ x: mx, y: my, radius: 1.5, kind: 'mine_place' });
      game.hazards.push({
        id: `haz_${++game.nextEntityId}`,
        kind: 'mine',
        team: shooter.team,
        x: mx,
        y: my,
        radius: sp2.triggerRadius,
        blastRadius: sp2.blastRadius,
        damage: sp2.damage
      });
      return events;
    }

    if (sp2.id === 'trap') {
      const spot = findNearestEmptyPoint(game.grid, game.tanks, ix, iy, 1, 6);
      const tx = spot ? spot.x + 0.5 : ix;
      const ty = spot ? spot.y + 0.5 : iy;
      if (shooter.trapBurstRemaining > 0) {
        shooter.trapBurstRemaining -= 1;
        shooter.special2Cooldown = sp2.cooldown;
      } else {
        shooter.trapBurstRemaining = (sp2.burstCount || 2) - 1;
        shooter.special2Cooldown = 0;
      }
      events.traces.push({ x1: ox, y1: oy, x2: tx, y2: ty, kind: 'trap' });
      events.explosions.push({ x: tx, y: ty, radius: 1.2, kind: 'trap_place' });
      game.hazards.push({
        id: `haz_${++game.nextEntityId}`,
        kind: 'trap',
        team: shooter.team,
        x: tx,
        y: ty,
        radius: sp2.triggerRadius,
        damage: sp2.damage,
        slowPercent: sp2.slowPercent,
        armingTurns: sp2.armingTurns ?? 1
      });
      return events;
    }

    if (sp2.id === 'fire_wall') {
      events.traces.push({ x1: ox, y1: oy, x2: ix, y2: iy, kind: 'fire_wall' });
      events.explosions.push({ x: ix, y: iy, radius: sp2.wallLength / 2, kind: 'fire_wall' });
      const fwHazard = {
        id: `haz_${++game.nextEntityId}`,
        kind: 'fire_wall',
        team: shooter.team,
        x: ix,
        y: iy,
        angle,
        length: sp2.wallLength,
        thickness: sp2.wallThickness,
        damage: sp2.burnDamage,
        turnsLeft: sp2.duration,
        hitThisTurn: []
      };
      game.hazards.push(fwHazard);
      for (const tank of game.tanks) {
        if (!tank.alive || tank.team === shooter.team) continue;
        if (isTankTouchingHazard(tank, fwHazard)) {
          recordTankDirectHit(tank, sp2.impactDamage, tank.x + TANK_SIZE / 2, tank.y + TANK_SIZE / 2);
          fwHazard.hitThisTurn.push(tank.id);
        }
      }
      return events;
    }

    if (sp2.id === 'auto_turret') {
      const spot = findNearestEmptyPoint(game.grid, game.tanks, ix, iy, 2, 8);
      const tx = spot ? spot.x : Math.floor(ix);
      const ty = spot ? spot.y : Math.floor(iy);
      events.traces.push({ x1: ox, y1: oy, x2: tx + 1, y2: ty + 1, kind: 'builder' });
      events.explosions.push({ x: tx + 1, y: ty + 1, radius: 2.0, kind: 'builder' });
      game.deployables.push({
        id: `tur_${++game.nextEntityId}`,
        kind: 'auto_turret',
        team: shooter.team,
        ownerId: shooter.id,
        name: shooter.team === 'player'
          ? 'Torreta Aliada'
          : shooter.team === 'player1'
            ? 'Torreta J1'
            : shooter.team === 'player2'
              ? 'Torreta J2'
              : 'Torreta IA',
        x: tx,
        y: ty,
        size: 2,
        hp: sp2.turretHp,
        maxHp: sp2.turretHp,
        turnsLeft: sp2.duration,
        range: sp2.fireRange,
        damage: sp2.fireDamage,
        aimAngle: angle
      });
      return events;
    }

    if (sp2.id === 'emp_bomb') {
      if (shooter.kind === 'drone') {
        const ownerTank = game.tanks.find((t) => t.id === shooter.ownerId);
        if (ownerTank) ownerTank.special2Cooldown = sp2.cooldown;
        shooter.droneSpecial2Cooldown = TURRET_CATALOG.drone.droneEmpCooldown;
      } else {
        shooter.special2Cooldown = sp2.cooldown;
        for (const d of game.deployables) {
          if (d.kind === 'drone' && d.ownerId === shooter.id && d.hp > 0) {
            d.droneSpecial2Cooldown = sp2.cooldown;
          }
        }
      }

      events.traces.push({ x1: ox, y1: oy, x2: ix, y2: iy, kind: 'emp' });
      events.explosions.push({ x: ix, y: iy, radius: sp2.blastRadius, kind: 'emp' });

      const affectedNames = [];
      for (const tank of game.tanks) {
        if (!tank.alive || tank.team === shooter.team) continue;
        const cx = tank.x + TANK_SIZE / 2;
        const cy = tank.y + TANK_SIZE / 2;
        const nearX = Math.max(tank.x, Math.min(ix, tank.x + TANK_SIZE));
        const nearY = Math.max(tank.y, Math.min(iy, tank.y + TANK_SIZE));
        const distToBox = Math.hypot(ix - nearX, iy - nearY);
        if (distToBox > sp2.blastRadius) continue;

        const isDirect =
          (ix >= tank.x - 0.5 && ix <= tank.x + TANK_SIZE + 0.5 && iy >= tank.y - 0.5 && iy <= tank.y + TANK_SIZE + 0.5) ||
          Math.hypot(ix - cx, iy - cy) <= sp2.directRadius;

        tank.empSlowTurns = Math.max(tank.empSlowTurns || 0, sp2.suppressTurns);
        tank.silencedTurns = Math.max(tank.silencedTurns || 0, sp2.suppressTurns);
        if (isDirect) {
          tank.stunnedTurns = Math.max(tank.stunnedTurns || 0, sp2.directStunTurns);
          tank.stunReason = 'emp';
          affectedNames.push(`${tank.name} (ATURDIDO 1t + SUPRESIÓN 2t)`);
        } else {
          if (tank.moveAp > 0 && game.phase === tank.team) {
            tank.moveAp = Math.max(1, Math.floor(tank.moveAp * (1 - sp2.slowPercent)));
          }
          affectedNames.push(`${tank.name} (SUPRESIÓN 2t)`);
        }
      }

      for (const dep of game.deployables) {
        if (dep.hp <= 0 || dep.team === shooter.team) continue;
        const dx = dep.x + dep.size / 2;
        const dy = dep.y + dep.size / 2;
        if (Math.hypot(dx - ix, dy - iy) <= sp2.blastRadius + dep.size / 2) {
          dep.hp = Math.max(0, dep.hp - 1);
          events.tankHits.push({
            tankId: dep.id,
            tankName: dep.name,
            damage: 1,
            remainingHp: dep.hp,
            destroyed: dep.hp === 0,
            x: dx,
            y: dy
          });
        }
      }

      events.empAffected = affectedNames;
      return events;
    }
  }

  // MODO ESPECIAL 1
  shooter.specialCooldown = turret.cooldown;

  if (shooter.turretId === 'mortar') {
    const reqDist = Math.hypot((targetX ?? ox + Math.cos(angle) * 28) - ox, (targetY ?? oy + Math.sin(angle) * 28) - oy);
    const clampedDist = Math.max(6, Math.min(turret.range, reqDist));
    const ix = Math.max(2.5, Math.min(GRID_W - 2.5, ox + Math.cos(angle) * clampedDist));
    const iy = Math.max(2.5, Math.min(GRID_H - 2.5, oy + Math.sin(angle) * clampedDist));

    events.traces.push({ x1: ox, y1: oy, x2: ix, y2: iy, kind: 'mortar' });
    events.explosions.push({ x: ix, y: iy, radius: turret.specialRadius, kind: 'mortar' });

    mergeCellChanges(applyRadialWallDamage(game.grid, ix, iy, turret.specialRadius, 4, 0.65));
    const splashHits = applyRadialTankDamage(
      game.tanks,
      ix,
      iy,
      turret.specialRadius + 1.2,
      computeOutgoingDamage(shooter, turret.specialDamage),
      computeOutgoingDamage(shooter, 14),
      game.deployables
    );
    events.tankHits.push(...splashHits);
  } else if (shooter.turretId === 'shotgun') {
    fireShotgunFan(turret.pellets, turret.spreadDeg, 46, turret.pelletDamage, turret.specialRadius, 'shotgun');
  } else if (shooter.turretId === 'bloodsucker') {
    const dealtTankDmg = fireShotgunFan(
      turret.pellets,
      turret.spreadDeg,
      turret.range,
      turret.pelletDamage,
      turret.specialRadius,
      'bloodsucker'
    );
    if (dealtTankDmg > 0 && shooter.alive) {
      const rawHeal = Math.max(1, Math.round(dealtTankDmg * turret.lifesteal));
      const actualHeal = Math.min(Math.max(0, shooter.maxHp - shooter.hp), rawHeal);
      shooter.hp = Math.min(shooter.maxHp, shooter.hp + rawHeal);
      events.heals.push({
        tankId: shooter.id,
        tankName: shooter.name,
        amount: actualHeal,
        rawHeal,
        remainingHp: shooter.hp,
        x: ox,
        y: oy
      });
    }
  } else if (shooter.turretId === 'ricochet') {
    let curX = ox;
    let curY = oy;
    let dx = Math.cos(angle);
    let dy = Math.sin(angle);
    let ignoreId = shooter.id;

    for (let b = 0; b <= turret.bounces; b++) {
      const wallHit = raycastWallDDA(game.grid, curX, curY, dx, dy, 160);
      const targetHit = findClosestTankHit(game.tanks, curX, curY, dx, dy, wallHit.t, ignoreId, game.deployables);

      if (targetHit) {
        events.traces.push({ x1: curX, y1: curY, x2: targetHit.x, y2: targetHit.y, kind: 'ricochet' });
        events.explosions.push({ x: targetHit.x, y: targetHit.y, radius: 2.2, kind: 'ricochet' });
        recordTargetHit(targetHit, turret.specialDamage, targetHit.x, targetHit.y);
        break;
      }

      events.traces.push({ x1: curX, y1: curY, x2: wallHit.x, y2: wallHit.y, kind: 'ricochet' });
      events.explosions.push({ x: wallHit.x, y: wallHit.y, radius: 1.3, kind: 'ricochet' });

      if (!wallHit.hit || b === turret.bounces) {
        if (wallHit.hit) {
          mergeCellChanges(applyRadialWallDamage(game.grid, wallHit.x, wallHit.y, 1.8, 2, 0.8));
        }
        break;
      }

      mergeCellChanges(applyRadialWallDamage(game.grid, wallHit.x, wallHit.y, 1.2, 1, 1.0));

      if (wallHit.normalX !== 0) dx = -dx;
      if (wallHit.normalY !== 0) dy = -dy;
      curX = wallHit.x + wallHit.normalX * 0.08;
      curY = wallHit.y + wallHit.normalY * 0.08;
      ignoreId = null;
    }
  } else if (shooter.turretId === 'piercing') {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let curX = ox;
    let curY = oy;
    let power = turret.piercePower;
    const hitTankIds = new Set([shooter.id]);
    let endX = ox;
    let endY = oy;

    for (let step = 0; step < 30 && power > 0; step++) {
      const wallHit = raycastWallDDA(game.grid, curX, curY, dx, dy, 170);

      const segmentTanks = [];
      for (const tank of game.tanks) {
        if (!tank.alive || hitTankIds.has(tank.id)) continue;
        const t = intersectRayAABB(curX, curY, dx, dy, tank.x, tank.y, TANK_SIZE, TANK_SIZE);
        if (t !== null && t <= wallHit.t) {
          segmentTanks.push({ tank, t, x: curX + dx * t, y: curY + dy * t });
        }
      }
      segmentTanks.sort((a, b) => a.t - b.t);
      for (const st of segmentTanks) {
        hitTankIds.add(st.tank.id);
        recordTankDirectHit(st.tank, turret.specialDamage, st.x, st.y);
        events.explosions.push({ x: st.x, y: st.y, radius: 1.8, kind: 'piercing' });
      }

      endX = wallHit.x;
      endY = wallHit.y;

      if (!wallHit.hit || wallHit.cellVal === CELL_STEEL) {
        events.explosions.push({ x: wallHit.x, y: wallHit.y, radius: 1.6, kind: 'piercing' });
        break;
      }

      mergeCellChanges(applyRadialWallDamage(game.grid, wallHit.x, wallHit.y, turret.specialRadius, 3, 0.5));
      events.explosions.push({ x: wallHit.x, y: wallHit.y, radius: 1.4, kind: 'piercing' });
      power--;
      curX = wallHit.x + dx * 0.9;
      curY = wallHit.y + dy * 0.9;
      if (curX < 1 || curX >= GRID_W - 1 || curY < 1 || curY >= GRID_H - 1) break;
    }

    events.traces.push({ x1: ox, y1: oy, x2: endX, y2: endY, kind: 'piercing' });
  } else if (shooter.turretId === 'builder') {
    const reqDist = Math.hypot((targetX ?? ox + Math.cos(angle) * 20) - ox, (targetY ?? oy + Math.sin(angle) * 20) - oy);
    const clampedDist = Math.max(6, Math.min(turret.range, reqDist));
    const ix = Math.max(3, Math.min(GRID_W - 3, ox + Math.cos(angle) * clampedDist));
    const iy = Math.max(3, Math.min(GRID_H - 3, oy + Math.sin(angle) * clampedDist));

    events.traces.push({ x1: ox, y1: oy, x2: ix, y2: iy, kind: 'builder' });
    events.explosions.push({ x: ix, y: iy, radius: 3.2, kind: 'builder' });
    mergeCellChanges(
      buildWallBarricade(game.grid, game.tanks, ix, iy, angle, turret.wallLength, turret.wallThickness, turret.wallHp)
    );
  } else if (shooter.turretId === 'toxic' || shooter.turretId === 'fire_shot') {
    const isFire = shooter.turretId === 'fire_shot';
    const fxKind = isFire ? 'fire_shot' : 'toxic';
    const poolKind = isFire ? 'fire_pool' : 'poison';
    const dotDmg = isFire ? turret.burnDamage : turret.poisonDamage;
    const dotDur = isFire ? turret.burnDuration : turret.poisonDuration;

    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const wallHit = raycastWallDDA(game.grid, ox, oy, dx, dy, 180);
    const targetHit = findClosestTankHit(game.tanks, ox, oy, dx, dy, wallHit.t, shooter.id, game.deployables);

    if (targetHit && targetHit.kind === 'tank') {
      events.traces.push({ x1: ox, y1: oy, x2: targetHit.x, y2: targetHit.y, kind: fxKind });
      events.explosions.push({ x: targetHit.x, y: targetHit.y, radius: 2.2, kind: fxKind });
      recordTargetHit(targetHit, turret.specialDamage, targetHit.x, targetHit.y);
      if (targetHit.tank.alive) {
        if (isFire) {
          targetHit.tank.burnTurns = dotDur;
          targetHit.tank.burnDamage = dotDmg;
        } else {
          targetHit.tank.poisonTurns = dotDur;
          targetHit.tank.poisonDamage = dotDmg;
        }
      }
    } else {
      let ix;
      let iy;
      if (targetHit && targetHit.kind === 'deployable') {
        recordTargetHit(targetHit, 1, targetHit.x, targetHit.y);
        ix = targetHit.x;
        iy = targetHit.y;
      } else {
        const hasTargetCoords = Number.isFinite(Number(targetX)) && Number.isFinite(Number(targetY));
        const reqDist = hasTargetCoords
          ? Math.max(4, Math.hypot(Number(targetX) - ox, Number(targetY) - oy))
          : wallHit.t;
        const maxOpenDist = wallHit.hit ? Math.max(1, wallHit.t - 0.35) : Math.min(turret.range, reqDist);
        const dropDist = hasTargetCoords ? Math.min(reqDist, wallHit.hit ? Math.max(1, wallHit.t - 0.35) : turret.range) : maxOpenDist;
        ix = Math.max(3, Math.min(GRID_W - 3, ox + dx * dropDist));
        iy = Math.max(3, Math.min(GRID_H - 3, oy + dy * dropDist));
      }
      events.traces.push({ x1: ox, y1: oy, x2: ix, y2: iy, kind: fxKind });
      events.explosions.push({ x: ix, y: iy, radius: turret.puddleRadius, kind: fxKind });
      game.hazards.push({
        id: `haz_${++game.nextEntityId}`,
        kind: poolKind,
        team: shooter.team,
        x: ix,
        y: iy,
        radius: turret.puddleRadius,
        damage: dotDmg,
        turnsLeft: turret.puddleDuration,
        hitThisTurn: []
      });
    }
  } else if (shooter.turretId === 'drone') {
    const reqDist = Math.hypot((targetX ?? ox + Math.cos(angle) * 16) - ox, (targetY ?? oy + Math.sin(angle) * 16) - oy);
    const clampedDist = Math.max(4, Math.min(turret.range, reqDist));
    const ix = Math.max(3, Math.min(GRID_W - 3, ox + Math.cos(angle) * clampedDist));
    const iy = Math.max(3, Math.min(GRID_H - 3, oy + Math.sin(angle) * clampedDist));
    const spot = findNearestEmptyPoint(game.grid, game.tanks, ix, iy, 2, 8);
    const tx = spot ? spot.x : Math.floor(ix);
    const ty = spot ? spot.y : Math.floor(iy);

    game.deployables = game.deployables.filter((d) => !(d.kind === 'drone' && d.ownerId === shooter.id));

    events.traces.push({ x1: ox, y1: oy, x2: tx + 1, y2: ty + 1, kind: 'drone' });
    events.explosions.push({ x: tx + 1, y: ty + 1, radius: 2.0, kind: 'drone' });
    game.deployables.push({
      id: `drone_${++game.nextEntityId}`,
      kind: 'drone',
      team: shooter.team,
      ownerId: shooter.id,
      turretId: shooter.turretId,
      special2Id: shooter.special2Id,
      name: shooter.team === 'player'
        ? 'Dron NetRunner'
        : shooter.team === 'player1'
          ? 'Dron J1'
          : shooter.team === 'player2'
            ? 'Dron J2'
            : 'Dron IA',
      x: tx,
      y: ty,
      size: 2,
      hp: turret.droneHp,
      maxHp: turret.droneHp,
      moveAp: turret.droneMoveAp,
      maxMoveAp: turret.droneMoveAp,
      canShoot: true,
      droneSpecial2Cooldown: shooter.special2Cooldown || 0,
      aimAngle: angle,
      dir: angle
    });
  }

  return events;
}

module.exports = {
  resolveShot
};
