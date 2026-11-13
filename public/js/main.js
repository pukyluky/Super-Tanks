import { initHangarUI } from './ui/hangar.js';
import { initBattleControls } from './ui/hud.js';
import { startRenderLoop } from './render/renderer.js';
import { sendWs, applyShotResolved, initShutdownButtons, connectWebSocket } from './net/wsClient.js';

initShutdownButtons();
initHangarUI(sendWs);
initBattleControls(sendWs);
startRenderLoop(applyShotResolved);
connectWebSocket();
