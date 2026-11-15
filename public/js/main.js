import { syncViewportClasses, loadSettings } from './state.js';
import { initHangarUI, resetBattleVisualState, updateWizardChrome } from './ui/hangar.js';
import { initMultiplayerUI } from './ui/multiplayer.js';
import { initBattleControls, initSettingsUI } from './ui/hud.js';
import { startRenderLoop } from './render/renderer.js';
import {
  sendWs,
  sendLocalWs,
  connectRemoteAdhoc,
  closeRemoteAdhoc,
  applyShotResolved,
  initShutdownButtons,
  connectWebSocket
} from './net/wsClient.js';

loadSettings();
syncViewportClasses();
window.addEventListener('resize', () => {
  syncViewportClasses();
  updateWizardChrome();
});
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    syncViewportClasses();
    updateWizardChrome();
  }, 60);
});

initShutdownButtons();
initMultiplayerUI({
  sendLocalWs,
  connectRemoteAdhoc,
  closeRemoteAdhoc,
  resetBattleEffects: resetBattleVisualState
});
initHangarUI(sendWs);
initBattleControls(sendWs);
initSettingsUI();
startRenderLoop(applyShotResolved);
connectWebSocket();
