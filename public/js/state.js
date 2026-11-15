import { DEFAULT_GRID_W, DEFAULT_GRID_H, DEFAULT_TANK_SIZE } from './constants.js';

export const state = {
  ws: null,
  adhocWs: null,
  catalog: null,
  hostInfo: { port: 3000, lanIps: [] },
  syncMode: 'pve', // 'pve' | 'pvp_adhoc' | 'pvp_legacy'
  gameMode: 'pve',
  isPvp: false,
  myTeam: 'player',
  activeTeam: 'player',
  adhocRoomCode: null,
  adhocRoomSsid: null,
  adhocLobby: null,
  discoveredAdhocHosts: [],
  selectedAdhocHostKey: null,
  legacyRole: null, // 'host' | 'guest'
  legacyChannel: 'acoustic', // 'acoustic' | 'loopback'
  legacyPeerSelection: null,

  selectedTankType: 'artillery',
  selectedArmor: 'medium',
  selectedDifficulty: 'normal',
  selectedMap: 'bunkers',
  hangarStep: 1,
  mobileInfoOpen: false,
  settings: {
    controlType: 'joystick', // 'joystick' | 'dpad' (Android)
    sensitivity: 1.0, // 0.5 .. 2.0 (Android)
    displayMode: 'windowed', // 'windowed' | 'borderless' | 'fullscreen' (PC)
    resolution: '1340x880' // 'auto' | '<W>x<H>' (PC)
  },

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

export function getMyTeamId() {
  return state.isPvp ? (state.myTeam || 'player1') : 'player';
}

export function isMyTurn() {
  return state.phase === 'player' && (!state.isPvp || state.activeTeam === getMyTeamId());
}

export const canvas = document.getElementById('game-canvas');
export const ctx = canvas.getContext('2d');
export const terrainCanvas = document.createElement('canvas');
export const terrainCtx = terrainCanvas.getContext('2d');

export const dom = {
  hangarScreen: document.getElementById('hangar-screen'),
  battleScreen: document.getElementById('battle-screen'),
  wsStatusEl: document.getElementById('ws-status'),
  startBtn: document.getElementById('start-match-btn'),
  hangarPrevBtn: document.getElementById('hangar-prev-btn'),
  hangarNextBtn: document.getElementById('hangar-next-btn'),
  mobileWizardSteps: document.getElementById('mobile-wizard-steps'),
  mobileSummaryCard: document.getElementById('mobile-summary-card'),
  stepVal1: document.getElementById('step-val-1'),
  stepVal2: document.getElementById('step-val-2'),
  stepVal3: document.getElementById('step-val-3'),
  stepVal4: document.getElementById('step-val-4'),
  previewCanvas: document.getElementById('tank-preview-canvas'),
  previewCtx: document.getElementById('tank-preview-canvas').getContext('2d'),

  tankTypeContainer: document.getElementById('tank-type-options'),
  tankSkillsSlot: document.getElementById('tank-skills-slot'),
  armorContainer: document.getElementById('armor-options'),
  difficultyContainer: document.getElementById('difficulty-options'),
  mapOptions: document.getElementById('map-options'),

  syncModeOptions: document.getElementById('sync-mode-options'),
  pveConfigBox: document.getElementById('pve-config-box'),
  adhocConfigBox: document.getElementById('adhoc-config-box'),
  legacyConfigBox: document.getElementById('legacy-config-box'),

  adhocTabHost: document.getElementById('adhoc-tab-host'),
  adhocTabGuest: document.getElementById('adhoc-tab-guest'),
  adhocHostPane: document.getElementById('adhoc-host-pane'),
  adhocGuestPane: document.getElementById('adhoc-guest-pane'),
  adhocSsidInput: document.getElementById('adhoc-ssid-input'),
  adhocHostAddr: document.getElementById('adhoc-host-addr'),
  adhocCreateBtn: document.getElementById('adhoc-create-btn'),
  adhocCancelBtn: document.getElementById('adhoc-cancel-btn'),
  adhocRoomWait: document.getElementById('adhoc-room-wait'),
  adhocRoomSsid: document.getElementById('adhoc-room-ssid'),
  adhocRoomCode: document.getElementById('adhoc-room-code'),
  adhocCopyBtn: document.getElementById('adhoc-copy-btn'),
  adhocRefreshBtn: document.getElementById('adhoc-refresh-btn'),
  adhocRoomList: document.getElementById('adhoc-room-list'),
  adhocJoinAddr: document.getElementById('adhoc-join-addr'),
  adhocJoinCode: document.getElementById('adhoc-join-code'),
  adhocJoinBtn: document.getElementById('adhoc-join-btn'),
  adhocGuestStatus: document.getElementById('adhoc-guest-status'),

  legacyChanAcoustic: document.getElementById('legacy-chan-acoustic'),
  legacyChanLoopback: document.getElementById('legacy-chan-loopback'),
  legacySignalBar: document.getElementById('legacy-signal-bar'),
  legacyStatusText: document.getElementById('legacy-status-text'),
  legacyHostBtn: document.getElementById('legacy-host-btn'),
  legacyGuestBtn: document.getElementById('legacy-guest-btn'),
  legacyResendBtn: document.getElementById('legacy-resend-btn'),
  ledHs: document.getElementById('led-hs'),
  ledCd: document.getElementById('led-cd'),
  ledTx: document.getElementById('led-tx'),
  ledRx: document.getElementById('led-rx'),

  legacyBattleBox: document.getElementById('legacy-battle-box'),
  battleModemStatus: document.getElementById('battle-modem-status'),
  battleLegacyResendBtn: document.getElementById('battle-legacy-resend-btn'),
  battleLedCd: document.getElementById('battle-led-cd'),
  battleLedTx: document.getElementById('battle-led-tx'),
  battleLedRx: document.getElementById('battle-led-rx'),
  enemyPanelTitle: document.getElementById('enemy-panel-title'),

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
  mWeaponNormalBtn: document.getElementById('m-weapon-normal-btn'),
  mWeaponSpecialBtn: document.getElementById('m-weapon-special-btn'),
  mWeaponSpecial2Btn: document.getElementById('m-weapon-special2-btn'),
  mobileFireBtn: document.getElementById('mobile-fire-btn'),
  mobileInfoBtn: document.getElementById('mobile-info-btn'),
  mobileSidebarClose: document.getElementById('mobile-sidebar-close'),
  battleSidebar: document.getElementById('battle-sidebar'),
  joyMove: document.getElementById('joy-move'),
  mobileDpad: document.getElementById('mobile-dpad'),
  joyAim: document.getElementById('joy-aim'),
  settingsOverlay: document.getElementById('settings-overlay'),
  settingsHangarBtn: document.getElementById('settings-hangar-btn'),
  settingsBattleBtn: document.getElementById('settings-battle-btn'),
  settingsCloseBtn: document.getElementById('settings-close-btn'),
  settingsDoneBtn: document.getElementById('settings-done-btn'),
  settingsResetBtn: document.getElementById('settings-reset-btn'),
  settingsControlOptions: document.getElementById('settings-control-options'),
  settingsSensitivity: document.getElementById('settings-sensitivity'),
  settingsSensitivityVal: document.getElementById('settings-sensitivity-val'),
  settingsSensitivityPresets: document.getElementById('settings-sensitivity-presets'),
  settingsDisplayModeOptions: document.getElementById('settings-display-mode-options'),
  settingsResolutionSelect: document.getElementById('settings-resolution-select'),
  settingsDisplayHint: document.getElementById('settings-display-hint'),
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
  overlayHangarBtn: document.getElementById('overlay-hangar-btn'),

  adhocLobbyScreen: document.getElementById('adhoc-lobby-screen'),
  lobbyRoleBadge: document.getElementById('lobby-role-badge'),
  lobbyRoomTitle: document.getElementById('lobby-room-title'),
  lobbySubtitle: document.getElementById('lobby-subtitle'),
  lobbyP1Summary: document.getElementById('lobby-p1-summary'),
  lobbyP2Summary: document.getElementById('lobby-p2-summary'),
  lobbyTankOptions: document.getElementById('lobby-tank-options'),
  lobbyArmorOptions: document.getElementById('lobby-armor-options'),
  lobbyMapHostWrap: document.getElementById('lobby-map-host-wrap'),
  lobbyMapGuestView: document.getElementById('lobby-map-guest-view'),
  lobbyGuestMapName: document.getElementById('lobby-guest-map-name'),
  lobbyStatusText: document.getElementById('lobby-status-text'),
  lobbyLeaveBtn: document.getElementById('lobby-leave-btn'),
  lobbyStartBtn: document.getElementById('lobby-start-btn')
};

export function isAndroidPlatform() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.AndroidBridge || (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')));
}

export function isMobileUi() {
  if (typeof window === 'undefined') return false;
  if (window.AndroidBridge) return true;
  if (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) return true;
  if (isAndroidPlatform()) {
    if (window.innerWidth <= 960) return true;
    if (window.innerHeight <= 560 && window.innerWidth <= 1050) return true;
  }
  return false;
}

const SETTINGS_STORAGE_KEY = 'tanques_controls_settings_v1';

export function applySettingsToDom() {
  if (typeof document === 'undefined') return;
  document.body.dataset.controlType = state.settings.controlType === 'dpad' ? 'dpad' : 'joystick';
  document.body.dataset.displayMode = state.settings.displayMode || 'windowed';
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.controlType === 'joystick' || parsed.controlType === 'dpad')) {
        state.settings.controlType = parsed.controlType;
      }
      const sens = Number(parsed?.sensitivity);
      if (Number.isFinite(sens) && sens >= 0.5 && sens <= 2.0) {
        state.settings.sensitivity = Math.round(sens * 20) / 20;
      }
      if (parsed && ['windowed', 'borderless', 'fullscreen'].includes(parsed.displayMode)) {
        state.settings.displayMode = parsed.displayMode;
      }
      if (typeof parsed?.resolution === 'string' && /^(auto|\d{3,4}x\d{3,4})$/.test(parsed.resolution)) {
        state.settings.resolution = parsed.resolution;
      }
    }
  } catch (_) {}
  applySettingsToDom();
}

export function saveSettings() {
  applySettingsToDom();
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
  } catch (_) {}
}

export function syncViewportClasses() {
  if (typeof document === 'undefined') return;
  const android = isAndroidPlatform();
  const mobile = isMobileUi();
  const landscape = window.innerWidth >= window.innerHeight;
  document.body.classList.toggle('android-platform', android);
  document.body.classList.toggle('pc-platform', !android);
  document.body.classList.toggle('mobile-mode', mobile);
  document.body.classList.toggle('landscape-mode', landscape);
  document.body.classList.toggle('portrait-mode', !landscape);
}

let toastTimer = null;
export function showToast(msg) {
  dom.toastEl.textContent = msg;
  dom.toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toastEl.classList.add('hidden'), 2400);
}
