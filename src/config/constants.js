const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

// Dimensiones de la micro-cuadrícula (120x72 micro-casillas de 8x8 px => 960x576 px)
const GRID_W = 120;
const GRID_H = 72;
const TANK_SIZE = 4; // Cada tanque ocupa 4x4 micro-casillas (32x32 px)

// Tipos de celda en la matriz:
//  0 = Camino libre
// -1 = Muro perimetral/acero indestructible
//  1..3 = Muro de ladrillo destructible (valor = puntos de vida)
const CELL_EMPTY = 0;
const CELL_STEEL = -1;
const BRICK_MAX_HP = 3;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

module.exports = {
  PORT,
  PUBLIC_DIR,
  GRID_W,
  GRID_H,
  TANK_SIZE,
  CELL_EMPTY,
  CELL_STEEL,
  BRICK_MAX_HP,
  MIME_TYPES
};
