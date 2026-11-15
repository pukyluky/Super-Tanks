import { state, dom, showToast, isMobileUi } from '../state.js';
import { legacyModem } from '../net/modemAudio.js';
import { normalizeAdhocAddress } from '../net/wsClient.js';
import { updateWizardChrome } from './hangar.js';
import { drawTankChassis, drawTankTurret } from '../assets/tankSprites.js';

const LOBBY_MAP_NAMES = {
  bunkers: 'Búnkeres',
  labyrinth: 'Laberinto',
  open: 'Campo Abierto',
  random: '🎲 Aleatorio'
};

let sendLocalWsFn = null;
let connectRemoteAdhocFn = null;
let closeRemoteAdhocFn = null;
let resetBattleEffectsFn = null;
let lastHostOffer = null;
let legacyMapSeed = null;
let adhocDiscoveryTimer = null;

function requestAdhocDiscovery() {
  if (!sendLocalWsFn || !state.ws || state.ws.readyState !== 1) return;
  sendLocalWsFn({ type: 'discover_adhoc_hosts' });
}

function stopAdhocDiscoveryPolling() {
  if (adhocDiscoveryTimer) {
    clearInterval(adhocDiscoveryTimer);
    adhocDiscoveryTimer = null;
  }
}

function startAdhocDiscoveryPolling() {
  stopAdhocDiscoveryPolling();
  requestAdhocDiscovery();
  adhocDiscoveryTimer = setInterval(() => {
    const inHangar = !dom.hangarScreen || !dom.hangarScreen.classList.contains('hidden');
    const guestVisible = dom.adhocGuestPane && !dom.adhocGuestPane.classList.contains('hidden');
    if (!inHangar || state.syncMode !== 'pvp_adhoc' || !guestVisible) {
      stopAdhocDiscoveryPolling();
      return;
    }
    requestAdhocDiscovery();
  }, 1200);
}

function getHostKey(host) {
  return `${host?.id || ''}@${host?.addr || ''}`;
}

function sendAdhocRoomMsg(payload) {
  if (state.adhocWs && state.adhocWs.readyState === 1) {
    state.adhocWs.send(JSON.stringify(payload));
    return;
  }
  if (sendLocalWsFn) sendLocalWsFn(payload);
}

function emitAdhocLobbyUpdate() {
  const isHost = state.myTeam === 'player1';
  const payload = {
    type: 'adhoc_lobby_update',
    tankTypeId: state.selectedTankType,
    armorId: state.selectedArmor
  };
  if (isHost) {
    payload.mapStyle = state.selectedMap;
  }
  sendAdhocRoomMsg(payload);
}

function formatLobbySelection(sel) {
  if (!sel || !state.catalog) return 'Conectando...';
  const tt = state.catalog.tankTypes?.[sel.tankTypeId];
  const ar = state.catalog.armors?.[sel.armorId];
  const tName = tt ? tt.name : sel.tankTypeId;
  const aName = ar ? `${ar.name.replace('Blindaje ', '')} (${ar.maxHp} PV)` : sel.armorId;
  return `${tName} • ${aName}`;
}

function renderAdhocLobby() {
  const lobby = state.adhocLobby;
  const cat = state.catalog;
  if (!lobby || !cat || !dom.adhocLobbyScreen) return;

  const isHost = state.myTeam === 'player1';
  if (dom.lobbyRoleBadge) {
    dom.lobbyRoleBadge.textContent = isHost ? 'PVP AD-HOC • ANFITRIÓN' : 'PVP AD-HOC • INVITADO';
  }
  if (dom.lobbyRoomTitle) {
    dom.lobbyRoomTitle.textContent = `Antesala: ${lobby.ssid || 'Sala Ad-Hoc'} (${lobby.code || ''})`;
  }
  if (dom.lobbySubtitle) {
    dom.lobbySubtitle.textContent = isHost
      ? 'Escoge tu tanque, blindaje y la arena de combate para iniciar la partida.'
      : 'Escoge tu tanque y blindaje mientras el anfitrión elige la arena e inicia el combate.';
  }
  if (dom.lobbyP1Summary) dom.lobbyP1Summary.textContent = formatLobbySelection(lobby.host);
  if (dom.lobbyP2Summary) dom.lobbyP2Summary.textContent = formatLobbySelection(lobby.guest);

  if (dom.lobbyTankOptions) {
    dom.lobbyTankOptions.innerHTML = '';
    Object.values(cat.tankTypes || {}).forEach((tt) => {
      const tu = cat.turrets?.[tt.turretId];
      const sp2 = cat.specials2?.[tt.special2Id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `option-card tank-option-card ${state.selectedTankType === tt.id ? 'active' : ''}`;
      btn.innerHTML = `
        <div class="tank-card-row">
          <canvas class="tank-mini-canvas" width="42" height="42"></canvas>
          <div class="tank-card-body">
            <div class="option-title">
              <span style="color:${tt.color}">${tt.name}</span>
              <span class="tank-card-badges">
                ${tt.passiveName ? '<span class="mini-badge pas">PAS</span>' : ''}
                <span class="mini-badge sp1">[2] ${tt.specialName} (${tu ? tu.cooldown : 2}t)</span>
                <span class="mini-badge sp2">[3] ${sp2 ? sp2.name : tt.special2Name}</span>
              </span>
            </div>
            <div class="option-desc">${tt.desc}</div>
          </div>
        </div>
      `;
      const miniCanvas = btn.querySelector('.tank-mini-canvas');
      if (miniCanvas) {
        const mCtx = miniCanvas.getContext('2d');
        mCtx.imageSmoothingEnabled = false;
        mCtx.save();
        mCtx.translate(21, 21);
        mCtx.scale(1.05, 1.05);
        drawTankChassis(mCtx, tt.color, tt.accent, 0, state.selectedArmor);
        drawTankTurret(mCtx, tt.turretId, tt.color, tt.accent, -0.35);
        mCtx.restore();
      }
      btn.onclick = () => {
        state.selectedTankType = tt.id;
        emitAdhocLobbyUpdate();
        renderAdhocLobby();
      };
      dom.lobbyTankOptions.appendChild(btn);
    });
  }

  if (dom.lobbyArmorOptions) {
    dom.lobbyArmorOptions.innerHTML = '';
    const armors = cat.armors || {};
    const maxArmorHp = Math.max(200, ...Object.values(armors).map((a) => a.maxHp || 0));
    Object.values(armors).forEach((ar) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `option-card armor-option-card ${state.selectedArmor === ar.id ? 'active' : ''}`;
      const hpPct = Math.round((ar.maxHp / maxArmorHp) * 100);
      const apPct = Math.round((ar.moveAp / 26) * 100);
      btn.innerHTML = `
        <div class="option-title">
          <span>${ar.name}</span>
          <span style="color:#38bdf8;font-size:12px;">${ar.maxHp} PV • ${ar.moveAp} AP</span>
        </div>
        <div class="armor-bars">
          <div class="armor-bar-row"><span>Resistencia</span><div class="armor-bar-track"><div class="armor-bar-fill hp" style="width:${hpPct}%"></div></div></div>
          <div class="armor-bar-row"><span>Movilidad</span><div class="armor-bar-track"><div class="armor-bar-fill ap" style="width:${apPct}%"></div></div></div>
        </div>
      `;
      btn.onclick = () => {
        state.selectedArmor = ar.id;
        emitAdhocLobbyUpdate();
        renderAdhocLobby();
      };
      dom.lobbyArmorOptions.appendChild(btn);
    });
  }

  const activeMap = lobby.mapStyle || state.selectedMap || 'bunkers';
  if (dom.lobbyMapHostWrap) {
    dom.lobbyMapHostWrap.classList.toggle('hidden', !isHost);
    if (isHost) {
      dom.lobbyMapHostWrap.querySelectorAll('[data-lobby-map]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.lobbyMap === activeMap);
        btn.onclick = () => {
          state.selectedMap = btn.dataset.lobbyMap;
          emitAdhocLobbyUpdate();
          renderAdhocLobby();
        };
      });
    }
  }
  if (dom.lobbyMapGuestView) {
    dom.lobbyMapGuestView.classList.toggle('hidden', isHost);
  }
  if (dom.lobbyGuestMapName) {
    dom.lobbyGuestMapName.textContent = LOBBY_MAP_NAMES[activeMap] || activeMap;
  }
  if (dom.lobbyStartBtn) {
    dom.lobbyStartBtn.classList.toggle('hidden', !isHost);
    dom.lobbyStartBtn.disabled = !lobby.guest;
  }
  if (dom.lobbyStatusText) {
    dom.lobbyStatusText.textContent = isHost
      ? 'Anfitrión listo: pulsa "Iniciar Batalla" para entrar en la arena.'
      : `Esperando a que el Anfitrión inicie en ${LOBBY_MAP_NAMES[activeMap] || activeMap}...`;
  }
}

function renderAdhocRoomList() {
  const listEl = dom.adhocRoomList;
  if (!listEl) return;
  listEl.innerHTML = '';

  const hosts = Array.isArray(state.discoveredAdhocHosts) ? state.discoveredAdhocHosts : [];
  if (hosts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'mp-room-empty';
    empty.textContent = 'Buscando puntos de conexión en la red local / Hotspot...';
    listEl.appendChild(empty);
    state.selectedAdhocHostKey = null;
    return;
  }

  const stillExists = hosts.some((h) => getHostKey(h) === state.selectedAdhocHostKey);
  if (!stillExists) {
    state.selectedAdhocHostKey = getHostKey(hosts[0]);
  }

  for (const host of hosts) {
    const key = getHostKey(host);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mp-room-item' + (key === state.selectedAdhocHostKey ? ' active' : '');

    const main = document.createElement('div');
    main.className = 'mp-room-main';

    const ssidEl = document.createElement('span');
    ssidEl.className = 'mp-room-ssid';
    ssidEl.textContent = host.ssid || 'Tanques-AP';

    const metaEl = document.createElement('span');
    metaEl.className = 'mp-room-meta';
    metaEl.textContent = `${host.tankName || 'Tanque'} · ${host.mapStyle || 'campo'} · ${host.addr}`;

    main.appendChild(ssidEl);
    main.appendChild(metaEl);

    const badge = document.createElement('span');
    badge.className = 'mp-room-badge';
    badge.textContent = (host.platform || 'LAN').toUpperCase();

    btn.appendChild(main);
    btn.appendChild(badge);
    btn.onclick = () => {
      state.selectedAdhocHostKey = key;
      renderAdhocRoomList();
      if (dom.adhocGuestStatus) {
        dom.adhocGuestStatus.textContent = `Seleccionado: ${host.ssid} (${host.addr}). Introduce la contraseña.`;
      }
      dom.adhocJoinCode?.focus();
    };
    listEl.appendChild(btn);
  }
}

function setLed(name, active) {
  const map = {
    hs: [dom.ledHs],
    cd: [dom.ledCd, dom.battleLedCd],
    tx: [dom.ledTx, dom.battleLedTx],
    rx: [dom.ledRx, dom.battleLedRx]
  };
  for (const el of map[name] || []) {
    if (!el) continue;
    el.classList.toggle('on', Boolean(active));
    if (name === 'tx') el.classList.add('tx');
    if (name === 'rx') el.classList.add('rx');
  }
}

function setModemLcd(text) {
  if (dom.legacyStatusText) dom.legacyStatusText.textContent = text;
  if (dom.battleModemStatus) dom.battleModemStatus.textContent = text;
}

export function updateHostAddrDisplay() {
  if (!dom.adhocHostAddr) return;
  const info = state.hostInfo || { port: 3000, lanIps: [] };
  const primary = info.lanIps && info.lanIps.length > 0
    ? `${info.lanIps[0]}:${info.port}`
    : location.host;
  const altCount = info.lanIps && info.lanIps.length > 1
    ? ` (${info.lanIps.slice(1, 3).map((ip) => `${ip}:${info.port}`).join(', ')})`
    : '';
  dom.adhocHostAddr.textContent = primary + altCount;
  if (dom.adhocJoinAddr && !dom.adhocJoinAddr.value) {
    dom.adhocJoinAddr.placeholder = `IP del Host (ej: ${primary})`;
  }
}

export function applySyncModeUI(mode) {
  state.syncMode = mode;
  dom.syncModeOptions?.querySelectorAll('.pill').forEach((b) => {
    b.classList.toggle('active', b.dataset.sync === mode);
  });

  dom.pveConfigBox?.classList.toggle('hidden', mode !== 'pve');
  dom.adhocConfigBox?.classList.toggle('hidden', mode !== 'pvp_adhoc');
  dom.legacyConfigBox?.classList.toggle('hidden', mode !== 'pvp_legacy');

  if (dom.startBtn) {
    const hideStart = mode !== 'pve' || (isMobileUi() && state.hangarStep !== 4);
    dom.startBtn.classList.toggle('hidden', hideStart);
  }
  if (mode === 'pvp_adhoc' && dom.adhocGuestPane && !dom.adhocGuestPane.classList.contains('hidden')) {
    startAdhocDiscoveryPolling();
  } else {
    stopAdhocDiscoveryPolling();
  }
  updateWizardChrome();
}

export function handleAdhocServerMessage(msg) {
  if (msg.type === 'adhoc_room_created') {
    state.adhocRoomCode = msg.code;
    state.adhocRoomSsid = msg.ssid || `Tanques-${msg.code}`;
    if (dom.adhocRoomCode) dom.adhocRoomCode.textContent = msg.code;
    if (dom.adhocRoomSsid) dom.adhocRoomSsid.textContent = state.adhocRoomSsid;
    dom.adhocRoomWait?.classList.remove('hidden');
    dom.adhocCancelBtn?.classList.remove('hidden');
    if (dom.adhocCreateBtn) dom.adhocCreateBtn.disabled = true;
    stopAdhocDiscoveryPolling();
    return true;
  }

  if (msg.type === 'adhoc_hosts') {
    state.discoveredAdhocHosts = Array.isArray(msg.hosts) ? msg.hosts : [];
    renderAdhocRoomList();
    return true;
  }

  if (msg.type === 'adhoc_room_joined') {
    state.adhocRoomCode = msg.code;
    state.adhocRoomSsid = msg.ssid || state.adhocRoomSsid;
    state.myTeam = msg.myTeam;
    stopAdhocDiscoveryPolling();
    if (resetBattleEffectsFn) resetBattleEffectsFn();
    return true;
  }

  if (msg.type === 'adhoc_lobby_state') {
    state.adhocLobby = msg;
    const mySel = state.myTeam === 'player1' ? msg.host : msg.guest;
    if (mySel) {
      if (mySel.tankTypeId) state.selectedTankType = mySel.tankTypeId;
      if (mySel.armorId) state.selectedArmor = mySel.armorId;
    }
    if (state.myTeam === 'player1' && msg.mapStyle) {
      state.selectedMap = msg.mapStyle;
    }
    dom.hangarScreen?.classList.add('hidden');
    dom.battleScreen?.classList.add('hidden');
    dom.adhocLobbyScreen?.classList.remove('hidden');
    renderAdhocLobby();
    return true;
  }

  if (msg.type === 'adhoc_error') {
    if (dom.adhocGuestStatus) dom.adhocGuestStatus.textContent = msg.message;
    showToast(msg.message);
    return true;
  }

  if (msg.type === 'adhoc_peer_left' || msg.type === 'adhoc_left') {
    state.adhocRoomCode = null;
    state.adhocRoomSsid = null;
    state.adhocLobby = null;
    dom.adhocRoomWait?.classList.add('hidden');
    dom.adhocCancelBtn?.classList.add('hidden');
    dom.adhocLobbyScreen?.classList.add('hidden');
    if (dom.adhocCreateBtn) dom.adhocCreateBtn.disabled = false;
    if (msg.message) showToast(msg.message);
    dom.gameoverOverlay?.classList.add('hidden');
    dom.battleScreen?.classList.add('hidden');
    dom.hangarScreen?.classList.remove('hidden');
    if (closeRemoteAdhocFn) closeRemoteAdhocFn();
    if (state.syncMode === 'pvp_adhoc' && dom.adhocGuestPane && !dom.adhocGuestPane.classList.contains('hidden')) {
      startAdhocDiscoveryPolling();
    }
    return true;
  }
  return false;
}

function startLocalLegacyMatch({ myTeam, mapStyle, mapSeed, p1TankTypeId, p1ArmorId, p2TankTypeId, p2ArmorId }) {
  if (resetBattleEffectsFn) resetBattleEffectsFn();
  state.gameMode = 'pvp_legacy';
  state.myTeam = myTeam;
  state.selectedMap = mapStyle;
  sendLocalWsFn({
    type: 'start_legacy_pvp',
    myTeam,
    mapStyle,
    mapSeed,
    p1TankTypeId,
    p1ArmorId,
    p2TankTypeId,
    p2ArmorId
  });
}

function onLegacyModemPacket(pkt, rawText) {
  setModemLcd(`RX [${pkt.type}]: ${rawText}`);

  if (pkt.type === 'host_offer' && state.legacyRole === 'guest') {
    lastHostOffer = pkt;
    legacyMapSeed = pkt.mapSeed || null;
    state.legacyPeerSelection = { tankTypeId: pkt.tankTypeId, armorId: pkt.armorId };
    setModemLcd(`RX Oferta Host (${pkt.tankTypeId}/${pkt.mapStyle}). Respondiendo...`);

    const sendJoinAndStart = async () => {
      await legacyModem.playDialupHandshake('guest');
      await legacyModem.sendPacket({
        type: 'guest_join',
        tankTypeId: state.selectedTankType,
        armorId: state.selectedArmor
      });
      dom.legacyResendBtn?.classList.remove('hidden');
      startLocalLegacyMatch({
        myTeam: 'player2',
        mapStyle: pkt.mapStyle,
        mapSeed: pkt.mapSeed,
        p1TankTypeId: pkt.tankTypeId,
        p1ArmorId: pkt.armorId,
        p2TankTypeId: state.selectedTankType,
        p2ArmorId: state.selectedArmor
      });
    };
    sendJoinAndStart();
    return;
  }

  if (pkt.type === 'guest_join' && state.legacyRole === 'host') {
    state.legacyPeerSelection = { tankTypeId: pkt.tankTypeId, armorId: pkt.armorId };
    setModemLcd(`CONNECT 56000/ARQ — Rival listo (${pkt.tankTypeId})`);
    startLocalLegacyMatch({
      myTeam: 'player1',
      mapStyle: state.selectedMap,
      mapSeed: legacyMapSeed,
      p1TankTypeId: state.selectedTankType,
      p1ArmorId: state.selectedArmor,
      p2TankTypeId: pkt.tankTypeId,
      p2ArmorId: pkt.armorId
    });
    return;
  }

  if (pkt.type === 'rematch' && state.gameMode === 'pvp_legacy') {
    startLocalLegacyMatch({
      myTeam: state.myTeam,
      mapStyle: pkt.mapStyle,
      mapSeed: pkt.mapSeed,
      p1TankTypeId: pkt.p1TankTypeId,
      p1ArmorId: pkt.p1ArmorId,
      p2TankTypeId: pkt.p2TankTypeId,
      p2ArmorId: pkt.p2ArmorId
    });
    showToast('Revancha sincronizada por módem 90s.');
    return;
  }

  if (state.gameMode === 'pvp_legacy' && pkt.actorTeam && pkt.actorTeam !== state.myTeam) {
    const action = { ...pkt };
    delete action.actorTeam;
    sendLocalWsFn({
      type: 'legacy_remote_action',
      actorTeam: pkt.actorTeam,
      action
    });
  }
}

export async function requestLegacyRematch() {
  if (!state.legacyPeerSelection || !legacyModem) return;
  const p1 = state.myTeam === 'player1'
    ? { tankTypeId: state.selectedTankType, armorId: state.selectedArmor }
    : state.legacyPeerSelection;
  const p2 = state.myTeam === 'player2'
    ? { tankTypeId: state.selectedTankType, armorId: state.selectedArmor }
    : state.legacyPeerSelection;

  const mapSeed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  legacyMapSeed = mapSeed;
  const payload = {
    type: 'rematch',
    mapStyle: state.selectedMap,
    mapSeed,
    p1TankTypeId: p1.tankTypeId,
    p1ArmorId: p1.armorId,
    p2TankTypeId: p2.tankTypeId,
    p2ArmorId: p2.armorId
  };
  await legacyModem.sendPacket(payload);
  startLocalLegacyMatch({ myTeam: state.myTeam, ...payload });
}

export function resetMultiplayerOnHangarReturn() {
  stopAdhocDiscoveryPolling();
  state.adhocLobby = null;
  dom.adhocLobbyScreen?.classList.add('hidden');
  if (state.adhocRoomCode) {
    const sock = (state.adhocWs && state.adhocWs.readyState === 1) ? state.adhocWs : state.ws;
    if (sock && sock.readyState === 1) {
      sock.send(JSON.stringify({ type: 'leave_adhoc_room' }));
    }
    state.adhocRoomCode = null;
    state.adhocRoomSsid = null;
  }
  if (closeRemoteAdhocFn) closeRemoteAdhocFn();
  if (legacyModem && state.gameMode === 'pvp_legacy') {
    legacyModem.stopListening();
  }
  state.gameMode = 'pve';
  state.isPvp = false;
  dom.adhocRoomWait?.classList.add('hidden');
  dom.adhocCancelBtn?.classList.add('hidden');
  if (dom.adhocCreateBtn) dom.adhocCreateBtn.disabled = false;
  if (lastHostOffer) lastHostOffer = null;
}

export function initMultiplayerUI({ sendLocalWs, connectRemoteAdhoc, closeRemoteAdhoc, resetBattleEffects }) {
  sendLocalWsFn = sendLocalWs;
  connectRemoteAdhocFn = connectRemoteAdhoc;
  closeRemoteAdhocFn = closeRemoteAdhoc;
  resetBattleEffectsFn = resetBattleEffects;

  dom.syncModeOptions?.querySelectorAll('.pill').forEach((btn) => {
    btn.onclick = () => applySyncModeUI(btn.dataset.sync);
  });

  // --- Ad-Hoc Controls ---
  const switchAdhocPane = (isHost) => {
    dom.adhocTabHost?.classList.toggle('active', isHost);
    dom.adhocTabGuest?.classList.toggle('active', !isHost);
    dom.adhocHostPane?.classList.toggle('hidden', !isHost);
    dom.adhocGuestPane?.classList.toggle('hidden', isHost);
    if (!isHost && state.syncMode === 'pvp_adhoc') {
      startAdhocDiscoveryPolling();
    } else {
      stopAdhocDiscoveryPolling();
    }
  };
  if (dom.adhocTabHost) dom.adhocTabHost.onclick = () => switchAdhocPane(true);
  if (dom.adhocTabGuest) dom.adhocTabGuest.onclick = () => switchAdhocPane(false);

  if (dom.adhocRefreshBtn) {
    dom.adhocRefreshBtn.onclick = () => {
      requestAdhocDiscovery();
      setTimeout(requestAdhocDiscovery, 200);
      showToast('Escaneando puntos de conexión...');
    };
  }
  renderAdhocRoomList();

  if (dom.adhocCreateBtn) {
    dom.adhocCreateBtn.onclick = () => {
      if (!state.ws || state.ws.readyState !== 1) {
        showToast('Esperando conexión con el servidor local...');
        return;
      }
      if (closeRemoteAdhocFn) closeRemoteAdhocFn();
      state.myTeam = 'player1';
      const selectedTank = state.catalog?.tankTypes?.[state.selectedTankType];
      const customSsid = (dom.adhocSsidInput?.value || '').trim();
      sendLocalWsFn({
        type: 'create_adhoc_room',
        ssid: customSsid || undefined,
        tankName: selectedTank?.name || state.selectedTankType,
        tankTypeId: state.selectedTankType,
        armorId: state.selectedArmor,
        mapStyle: state.selectedMap
      });
    };
  }

  if (dom.adhocCancelBtn) {
    dom.adhocCancelBtn.onclick = () => {
      sendLocalWsFn({ type: 'leave_adhoc_room' });
      state.adhocRoomCode = null;
      state.adhocRoomSsid = null;
      dom.adhocRoomWait?.classList.add('hidden');
      dom.adhocCancelBtn?.classList.add('hidden');
      if (dom.adhocCreateBtn) dom.adhocCreateBtn.disabled = false;
    };
  }

  if (dom.adhocCopyBtn) {
    dom.adhocCopyBtn.onclick = async () => {
      const info = state.hostInfo || { port: 3000, lanIps: [] };
      const primary = info.lanIps && info.lanIps.length > 0
        ? `${info.lanIps[0]}:${info.port}`
        : location.host;
      const ssidLabel = state.adhocRoomSsid || `Tanques-${state.adhocRoomCode || ''}`;
      const text = `Red: ${ssidLabel} | Contraseña: ${state.adhocRoomCode || ''} | ${primary}`;
      try {
        await navigator.clipboard.writeText(text);
        showToast('Red y contraseña copiadas al portapapeles.');
      } catch (_) {
        showToast(text);
      }
    };
  }

  if (dom.adhocJoinBtn) {
    dom.adhocJoinBtn.onclick = () => {
      const manualRaw = (dom.adhocJoinAddr?.value || '').trim();
      const parsed = normalizeAdhocAddress(manualRaw);
      if (parsed.extractedCode && dom.adhocJoinCode && !dom.adhocJoinCode.value.trim()) {
        dom.adhocJoinCode.value = parsed.extractedCode;
      }
      if (parsed.hostPort && dom.adhocJoinAddr && manualRaw) {
        dom.adhocJoinAddr.value = parsed.hostPort;
      }

      const hosts = Array.isArray(state.discoveredAdhocHosts) ? state.discoveredAdhocHosts : [];
      const selectedHost = hosts.find((h) => getHostKey(h) === state.selectedAdhocHostKey) || hosts[0] || null;
      const targetAddr = parsed.hostPort || selectedHost?.addr || '';
      if (!targetAddr) {
        showToast('Selecciona un punto de conexión de la lista o usa IP:Puerto manual.');
        return;
      }

      const code = (dom.adhocJoinCode?.value || parsed.extractedCode || '').trim().toUpperCase();
      if (!code) {
        showToast('Introduce la contraseña (código del Host) para conectarte.');
        dom.adhocJoinCode?.focus();
        return;
      }
      const joinPayload = {
        type: 'join_adhoc_room',
        code,
        tankTypeId: state.selectedTankType,
        armorId: state.selectedArmor
      };
      if (targetAddr === location.host) {
        if (closeRemoteAdhocFn) closeRemoteAdhocFn();
        sendLocalWsFn(joinPayload);
        return;
      }
      const label = selectedHost ? `${selectedHost.ssid} (${targetAddr})` : targetAddr;
      if (dom.adhocGuestStatus) dom.adhocGuestStatus.textContent = `Conectando con ${label}...`;
      connectRemoteAdhocFn(targetAddr, joinPayload);
    };
  }

  if (dom.lobbyStartBtn) {
    dom.lobbyStartBtn.onclick = () => {
      if (state.myTeam !== 'player1') return;
      sendAdhocRoomMsg({ type: 'adhoc_start_match' });
    };
  }

  if (dom.lobbyLeaveBtn) {
    dom.lobbyLeaveBtn.onclick = () => {
      resetMultiplayerOnHangarReturn();
      dom.hangarScreen?.classList.remove('hidden');
    };
  }

  // --- Legacy 90s Modem Controls ---
  if (legacyModem) {
    legacyModem.setCallbacks({
      onPacket: onLegacyModemPacket,
      onLed: setLed,
      onStatus: setModemLcd,
      onLevel: (strength) => {
        if (dom.legacySignalBar) {
          dom.legacySignalBar.style.width = `${Math.round(Math.min(1, strength) * 100)}%`;
        }
      }
    });
  }

  const selectLegacyChannel = (ch) => {
    state.legacyChannel = ch;
    dom.legacyChanAcoustic?.classList.toggle('active', ch === 'acoustic');
    dom.legacyChanLoopback?.classList.toggle('active', ch === 'loopback');
  };
  if (dom.legacyChanAcoustic) dom.legacyChanAcoustic.onclick = () => selectLegacyChannel('acoustic');
  if (dom.legacyChanLoopback) dom.legacyChanLoopback.onclick = () => selectLegacyChannel('loopback');

  if (dom.legacyHostBtn) {
    dom.legacyHostBtn.onclick = async () => {
      if (!legacyModem) return;
      state.legacyRole = 'host';
      const listenRes = await legacyModem.startListening(state.legacyChannel);
      if (!listenRes.ok && state.legacyChannel === 'acoustic') {
        showToast('Micrófono no disponible: cambia a "Mismo PC" o permite el micrófono.');
        return;
      }
      const ms = await legacyModem.playDialupHandshake('host');
      legacyMapSeed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      setTimeout(async () => {
        await legacyModem.sendPacket({
          type: 'host_offer',
          tankTypeId: state.selectedTankType,
          armorId: state.selectedArmor,
          mapStyle: state.selectedMap,
          mapSeed: legacyMapSeed
        });
        dom.legacyResendBtn?.classList.remove('hidden');
        setModemLcd('Oferta FSK emitida (1200/2200 Hz). Esperando respuesta del Invitado...');
      }, Math.max(100, ms - 120));
    };
  }

  if (dom.legacyGuestBtn) {
    dom.legacyGuestBtn.onclick = async () => {
      if (!legacyModem) return;
      state.legacyRole = 'guest';
      const listenRes = await legacyModem.startListening(state.legacyChannel);
      if (!listenRes.ok && state.legacyChannel === 'acoustic') {
        showToast('Micrófono no disponible: cambia a "Mismo PC" o permite el micrófono.');
        return;
      }
      legacyModem.playRelayClick(legacyModem.ensureContext().currentTime + 0.02);
      setModemLcd('Descolgado (ATA) — Escuchando oferta FSK del Host por audio...');
    };
  }

  const handleResend = async () => {
    if (!legacyModem) return;
    const ok = await legacyModem.resendLastPacket();
    if (ok) showToast('Tono FSK retransmitido por el altavoz.');
  };
  if (dom.legacyResendBtn) dom.legacyResendBtn.onclick = handleResend;
  if (dom.battleLegacyResendBtn) dom.battleLegacyResendBtn.onclick = handleResend;
}
