const LIGHT_ARMOR = {
  id: 'light',
  name: 'Blindaje Ligero',
  maxHp: 85,
  moveAp: 26,
  desc: 'Alta movilidad por turno (26 casillas) y blindaje ligero (85 PV).'
};

const MEDIUM_ARMOR = {
  id: 'medium',
  name: 'Blindaje Medio',
  maxHp: 115,
  moveAp: 19,
  desc: 'Equilibrio táctico entre movilidad (19 casillas) y resistencia (115 PV).'
};

const HEAVY_ARMOR = {
  id: 'heavy',
  name: 'Blindaje Pesado',
  maxHp: 155,
  moveAp: 13,
  desc: 'Blindaje pesado (155 PV) con menor desplazamiento (13 casillas).'
};

const ARMOR_CATALOG = {
  light: LIGHT_ARMOR,
  medium: MEDIUM_ARMOR,
  heavy: HEAVY_ARMOR
};

module.exports = {
  LIGHT_ARMOR,
  MEDIUM_ARMOR,
  HEAVY_ARMOR,
  ARMOR_CATALOG
};
