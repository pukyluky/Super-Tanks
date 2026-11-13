import { DEFAULT_GRID_W, DEFAULT_GRID_H, DEFAULT_TANK_SIZE } from './constants.js';

export const state = {
  ws: null,
  catalog: null,
  selectedTankType: 'artillery',
  selectedArmor: 'medium',
  selectedDifficulty: 'normal',
  selectedMap: 'bunkers',

  gridW: DEFAULT_GRID_W,
  gridH: DEFAULT_GRID_H,
  tankSize: DEFAULT_TANK_SIZE,
  grid: null,
  rubbleSet: new Set(),
  tanks: [],
  hazards: [],
  deployables: [],
  turnNumber: 1,
  phase: 'hangar',
  activeControl: 'player',
  winner: null,
  logs: [],

  clickMode: 'shoot', // 'shoot' | 'move'
  weaponMode: 'normal', // 'normal' | 'special' | 'special2'
  mouseGrid: { x: 60, y: 36 },

  visualTanks: new Map(), // id -> { x, y, dir, aimAngle, queue: [], pendingShots: [] }
  activeTraces: [],
  particles: [],
  floatingTexts: [],
  lastKeyMoveAt: 0,
  serverStopped: false
};

export const canvas = document.getElementById('game-canvas');
export const ctx = canvas.getContext('2d');
export const terrainCanvas = document.createElement('canvas');
export const terrainCtx = terrainCanvas.getContext('2d');

export const dom = {
  hangarScreen: document.getElementById('hangar-screen'),
  battleScreen: document.getElementById('battle-screen'),
  wsStatusEl: document.getElementById('ws-status'),
  startBtn: document.getElementById('start-match-btn'),
  previewCanvas: document.getElementById('tank-preview-canvas'),
  previewCtx: document.getElementById('tank-preview-canvas').getContext('2d'),

  tankTypeContainer: document.getElementById('tank-type-options'),
  tankSkillsSlot: document.getElementById('tank-skills-slot'),
  armorContainer: document.getElementById('armor-options'),
  difficultyContainer: document.getElementById('difficulty-options'),
  mapOptions: document.getElementById('map-options'),

  turnIndicator: document.getElementById('turn-indicator'),
  phaseIndicator: document.getElementById('phase-indicator'),
  playerHpBar: document.getElementById('player-hp-bar'),
  playerHpText: document.getElementById('player-hp-text'),
  playerApText: document.getElementById('player-ap-text'),

  toggleControlBtn: document.getElementById('toggle-control-btn'),
  modeShootBtn: document.getElementById('mode-shoot-btn'),
  modeMoveBtn: document.getElementById('mode-move-btn'),
  weaponNormalBtn: document.getElementById('weapon-normal-btn'),
  weaponSpecialBtn: document.getElementById('weapon-special-btn'),
  weaponSpecial2Btn: document.getElementById('weapon-special2-btn'),
  endTurnBtn: document.getElementById('end-turn-btn'),
  backHangarBtn: document.getElementById('back-hangar-btn'),
  shutdownHangarBtn: document.getElementById('shutdown-hangar-btn'),
  shutdownBattleBtn: document.getElementById('shutdown-battle-btn'),

  enemyListEl: document.getElementById('enemy-list'),
  combatLogEl: document.getElementById('combat-log'),
  toastEl: document.getElementById('toast-banner'),
  gameoverOverlay: document.getElementById('gameover-overlay'),
  gameoverTitle: document.getElementById('gameover-title'),
  gameoverDesc: document.getElementById('gameover-desc'),
  rematchBtn: document.getElementById('rematch-btn'),
  overlayHangarBtn: document.getElementById('overlay-hangar-btn')
};

let toastTimer = null;
export function showToast(msg) {
  dom.toastEl.textContent = msg;
  dom.toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toastEl.classList.add('hidden'), 2400);
}
