const { BRICK_MAX_HP } = require('../config/constants');

const MORTAR_ABILITY = {
  id: 'mortar',
  name: 'Mortero Táctico',
  cooldown: 2,
  range: 62.4,
  specialDamage: 20,
  specialRadius: 4.8,
  desc: 'Salta muros hasta el punto apuntado y abre enormes cráteres con daño radial.'
};

const SHOTGUN_ABILITY = {
  id: 'shotgun',
  name: 'Cañón Metralla',
  cooldown: 2,
  pellets: 5,
  spreadDeg: 26,
  pelletDamage: 14,
  specialRadius: 2.0,
  desc: 'Dispara 5 proyectiles en abanico 360° ideales para destrozar cobertura y cercanías.'
};

const RICOCHET_ABILITY = {
  id: 'ricochet',
  name: 'Cañón Rebotador',
  cooldown: 2,
  bounces: 3,
  specialDamage: 36,
  specialRadius: 1.8,
  desc: 'Proyectil cinético que rebota hasta 3 veces en los muros para atacar en esquina.'
};

const PIERCING_ABILITY = {
  id: 'piercing',
  name: 'Rifle Perforante',
  cooldown: 2,
  maxWallPierce: 1,
  piercePower: 1,
  specialDamage: 40,
  specialRadius: 1.5,
  desc: 'Perfora 1 única pared de ladrillo y atraviesa tanques sin límite en línea recta.'
};

const BUILDER_ABILITY = {
  id: 'builder',
  name: 'Proyectil Constructor',
  cooldown: 2,
  range: 46,
  wallLength: 10,
  wallThickness: 3,
  wallHp: BRICK_MAX_HP,
  desc: 'Despliega un muro destructible de ladrillo perpendicular en el punto apuntado.'
};

const TOXIC_ABILITY = {
  id: 'toxic',
  name: 'Tiro Tóxico',
  cooldown: 3,
  range: 48,
  specialDamage: 10,
  poisonDamage: 7,
  poisonDuration: 4,
  puddleRadius: 4.5,
  puddleDuration: 3,
  desc: 'Impacto directo: 10 daño + veneno (7/t durante 4t, renueva sin acumular). Si falla: deja charco (7/t al enemigo, 3t).'
};

const FIRE_SHOT_ABILITY = {
  id: 'fire_shot',
  name: 'Tiro de Fuego',
  cooldown: 3,
  range: 48,
  specialDamage: 10,
  burnDamage: 7,
  burnDuration: 4,
  puddleRadius: 4.5,
  puddleDuration: 3,
  desc: 'Impacto directo: 10 daño + fuego (7/t durante 4t, renueva sin acumular). Si falla: charco rojo (7/t al enemigo, 3t).'
};

const DRONE_ABILITY = {
  id: 'drone',
  name: 'Dron NetRunner',
  cooldown: 2,
  range: 36,
  droneHp: 2,
  droneMoveAp: 18,
  droneShotDamage: 20,
  droneEmpCooldown: 3,
  desc: 'Despliega un dron controlable (2 PV, 18 AP) en el mismo turno: dispara (20 daño) o lanza Bomba PEM (CD dron 3t / tanque 4t).'
};

const BLOODSUCKER_ABILITY = {
  id: 'bloodsucker',
  name: 'Chupasangre',
  cooldown: 4,
  pellets: 7,
  spreadDeg: 32,
  range: 26,
  pelletDamage: 5,
  lifesteal: 0.3,
  specialRadius: 1.4,
  desc: 'Escopeta corta (7 perdigones de 5 daño, rango 26): recupera un 30% del daño infligido en impacto como vida.'
};

const TURRET_CATALOG = {
  mortar: MORTAR_ABILITY,
  shotgun: SHOTGUN_ABILITY,
  ricochet: RICOCHET_ABILITY,
  piercing: PIERCING_ABILITY,
  builder: BUILDER_ABILITY,
  toxic: TOXIC_ABILITY,
  fire_shot: FIRE_SHOT_ABILITY,
  drone: DRONE_ABILITY,
  bloodsucker: BLOODSUCKER_ABILITY
};

module.exports = {
  MORTAR_ABILITY,
  SHOTGUN_ABILITY,
  RICOCHET_ABILITY,
  PIERCING_ABILITY,
  BUILDER_ABILITY,
  TOXIC_ABILITY,
  FIRE_SHOT_ABILITY,
  DRONE_ABILITY,
  BLOODSUCKER_ABILITY,
  TURRET_CATALOG
};
