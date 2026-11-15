const MOLOTOV_ABILITY = {
  id: 'molotov',
  name: 'Molotov',
  cooldown: 3,
  range: 44,
  radius: 4.5,
  impactDamage: 10,
  burnDamage: 8,
  duration: 3,
  desc: 'Lanza fuego en área durante 3 turnos: daña al impacto y quema a quien pase o siga dentro.'
};

const LANDMINE_ABILITY = {
  id: 'landmine',
  name: 'Mina Terrestre',
  cooldown: 2,
  range: 34,
  triggerRadius: 2.3,
  blastRadius: 3.0,
  damage: 38,
  desc: 'Coloca una mina explosiva que detona al paso de un tanque enemigo (38 de daño y cráter).'
};

const CHARGED_SHOT_ABILITY = {
  id: 'charged_shot',
  name: 'Tiro Cargado',
  cooldown: 2,
  damage: 52,
  blastRadius: 2.8,
  desc: '1 turno cargando energía y al siguiente lanza un disparo devastador de 52 de daño.'
};

const TRAP_ABILITY = {
  id: 'trap',
  name: 'Trampa Invisible',
  cooldown: 2,
  range: 40,
  triggerRadius: 2.3,
  damage: 10,
  slowPercent: 0.35,
  burstCount: 2,
  armingTurns: 1,
  desc: 'Coloca 2 trampas invisibles seguidas (tardan 1 turno en activarse): 10 de daño y -35% movimiento.'
};

const AUTO_TURRET_ABILITY = {
  id: 'auto_turret',
  name: 'Torreta',
  cooldown: 3,
  range: 36,
  turretHp: 2,
  duration: 4,
  fireRange: 44,
  fireDamage: 25,
  desc: 'Despliega una torreta (2 PV, dura 4 turnos) que dispara 1 vez por turno (25 daño) al enemigo a tiro.'
};

const FREEZE_SHOT_ABILITY = {
  id: 'freeze_shot',
  name: 'Tiro Congelador',
  cooldown: 3,
  damage: 10,
  stunTurns: 1,
  desc: 'Disparo criogénico: inflige 10 de daño y aturde (congela) al enemigo durante 1 turno.'
};

const FIRE_WALL_ABILITY = {
  id: 'fire_wall',
  name: 'Muro de Fuego',
  cooldown: 3,
  range: 46,
  wallLength: 14,
  wallThickness: 2,
  impactDamage: 15,
  burnDamage: 13,
  duration: 3,
  desc: 'Muro de fuego ancho y fino perpendicular (3t): 15 al impacto y 13/turno (10% más que Molotov).'
};

const EMP_BOMB_ABILITY = {
  id: 'emp_bomb',
  name: 'Bomba PEM',
  cooldown: 4,
  range: 46,
  blastRadius: 5.0,
  directRadius: 2.5,
  slowPercent: 0.25,
  suppressTurns: 2,
  directStunTurns: 1,
  desc: 'Supresión 2t (-25% mov. y bloquea especiales). Golpe directo: primero 1t aturdido y luego 2t de supresión.'
};

const RAGE_ABILITY = {
  id: 'rage',
  name: 'Ira',
  cooldown: 0,
  selfBuff: true,
  damageReduction: 0.9,
  moveBonusPercent: 0.25,
  maxHpPercent: 0.25,
  duration: 1,
  desc: 'Solo cuando la vida baja del 25% PV y sin CD (dura 1 turno): reduce 90% el daño recibido y otorga +25% de distancia de desplazamiento.'
};

const SPECIAL2_CATALOG = {
  molotov: MOLOTOV_ABILITY,
  landmine: LANDMINE_ABILITY,
  charged_shot: CHARGED_SHOT_ABILITY,
  trap: TRAP_ABILITY,
  auto_turret: AUTO_TURRET_ABILITY,
  freeze_shot: FREEZE_SHOT_ABILITY,
  fire_wall: FIRE_WALL_ABILITY,
  emp_bomb: EMP_BOMB_ABILITY,
  rage: RAGE_ABILITY
};

module.exports = {
  MOLOTOV_ABILITY,
  LANDMINE_ABILITY,
  CHARGED_SHOT_ABILITY,
  TRAP_ABILITY,
  AUTO_TURRET_ABILITY,
  FREEZE_SHOT_ABILITY,
  FIRE_WALL_ABILITY,
  EMP_BOMB_ABILITY,
  RAGE_ABILITY,
  SPECIAL2_CATALOG
};
