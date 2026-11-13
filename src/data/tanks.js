const ARTILLERY_TANK = {
  id: 'artillery',
  name: 'Artillero',
  turretId: 'mortar',
  specialName: 'Mortero Táctico',
  special2Id: 'molotov',
  special2Name: 'Molotov',
  color: '#fbbf24',
  accent: '#b45309',
  desc: 'Especiales: Mortero Táctico (cráter sobre muros) y Molotov (zona de fuego 3 turnos).'
};

const BREACHER_TANK = {
  id: 'breacher',
  name: 'Escopetero',
  turretId: 'shotgun',
  specialName: 'Cañón Metralla',
  special2Id: 'landmine',
  special2Name: 'Mina Terrestre',
  color: '#4ade80',
  accent: '#15803d',
  desc: 'Especiales: Cañón Metralla (5 proyectiles) y Mina Terrestre explosiva.'
};

const PRISMA_TANK = {
  id: 'prisma',
  name: 'Rebotador',
  turretId: 'ricochet',
  specialName: 'Cañón Rebotador',
  special2Id: 'charged_shot',
  special2Name: 'Tiro Cargado',
  color: '#38bdf8',
  accent: '#0369a1',
  desc: 'Especiales: Cañón Rebotador (3 rebotes) y Tiro Cargado (1 turno carga, siguiente 52 daño).'
};

const HUNTER_TANK = {
  id: 'hunter',
  name: 'Cazacarros',
  turretId: 'piercing',
  specialName: 'Rifle Perforante',
  special2Id: 'trap',
  special2Name: 'Trampa Invisible',
  color: '#c084fc',
  accent: '#7e22ce',
  desc: 'Especiales: Rifle Perforante y Trampa Invisible (2 trampas, 1 turno de armado, 10 daño y -35% mov.).'
};

const ENGINEER_TANK = {
  id: 'engineer',
  name: 'Ingeniero',
  turretId: 'builder',
  specialName: 'Proyectil Constructor',
  special2Id: 'auto_turret',
  special2Name: 'Torreta',
  color: '#2dd4bf',
  accent: '#0f766e',
  desc: 'Especiales: Proyectil Constructor (crea muros) y Torreta autónoma (2 PV, dura 4 turnos, 25 daño).'
};

const CHEMIST_TANK = {
  id: 'chemist',
  name: 'Químico',
  turretId: 'toxic',
  specialName: 'Tiro Tóxico',
  special2Id: 'freeze_shot',
  special2Name: 'Tiro Congelador',
  color: '#a3e635',
  accent: '#3f6212',
  desc: 'Especiales: Tiro Tóxico (10 + veneno 7/t x 4t o charco) y Tiro Congelador (10 daño + 1t aturdido).'
};

const CAIN_TANK = {
  id: 'cain',
  name: 'Caín',
  turretId: 'fire_shot',
  specialName: 'Tiro de Fuego',
  special2Id: 'fire_wall',
  special2Name: 'Muro de Fuego',
  color: '#ef4444',
  accent: '#7f1d1d',
  desc: 'Especiales: Tiro de Fuego (10 + fuego 7/t x 4t o charco rojo) y Muro de Fuego (15 + 13/t).'
};

const NETRUNNER_TANK = {
  id: 'netrunner',
  name: 'NetRunner',
  basicWeapon: 'short_shotgun',
  turretId: 'drone',
  specialName: 'Dron NetRunner',
  special2Id: 'emp_bomb',
  special2Name: 'Bomba PEM',
  color: '#00d4ff',
  accent: '#1d4ed8',
  desc: 'Básico: Escopeta Corta. Especiales: Dron controlable (2 PV, 20 daño) y Bomba PEM (aturde/suprime).'
};

const TANK_TYPES_CATALOG = {
  artillery: ARTILLERY_TANK,
  breacher: BREACHER_TANK,
  prisma: PRISMA_TANK,
  hunter: HUNTER_TANK,
  engineer: ENGINEER_TANK,
  chemist: CHEMIST_TANK,
  cain: CAIN_TANK,
  netrunner: NETRUNNER_TANK
};

const DIFFICULTY_CONFIG = {
  easy: {
    id: 'easy',
    name: 'Fácil',
    enemyCount: 2,
    hpScale: 0.78,
    apScale: 0.85,
    aimJitterRad: (11 * Math.PI) / 180,
    useSpecialChance: 0.25
  },
  normal: {
    id: 'normal',
    name: 'Normal',
    enemyCount: 3,
    hpScale: 1.0,
    apScale: 1.0,
    aimJitterRad: (3.5 * Math.PI) / 180,
    useSpecialChance: 0.65
  },
  hard: {
    id: 'hard',
    name: 'Difícil',
    enemyCount: 4,
    hpScale: 1.15,
    apScale: 1.1,
    aimJitterRad: (1.0 * Math.PI) / 180,
    useSpecialChance: 0.95
  }
};

module.exports = {
  ARTILLERY_TANK,
  BREACHER_TANK,
  PRISMA_TANK,
  HUNTER_TANK,
  ENGINEER_TANK,
  CHEMIST_TANK,
  CAIN_TANK,
  NETRUNNER_TANK,
  TANK_TYPES_CATALOG,
  DIFFICULTY_CONFIG
};
