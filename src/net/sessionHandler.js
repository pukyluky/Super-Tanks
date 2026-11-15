const crypto = require('crypto');
const { GRID_W, GRID_H, TANK_SIZE } = require('../config/constants');
const { ARMOR_CATALOG } = require('../data/armors');
const { TURRET_CATALOG } = require('../data/specials1');
const { SPECIAL2_CATALOG } = require('../data/specials2');
const { TANK_TYPES_CATALOG, DIFFICULTY_CONFIG } = require('../data/tanks');
const {
  createMatch,
  createPvpMatch,
  serializeState,
  beginAITurn,
  advancePvpTurn
} = require('../engine/match');
const { broadcastForRecipients, executeTurnAction } = require('../engine/turnExecutor');
const {
  createAdhocRoom,
  joinAdhocRoom,
  leaveAdhocRoom,
  handleAdhocGameAction
} = require('./adhocRooms');
const { encodeWsText, decodeWsFrames } = require('./websocket');

function attachWebSocketSession(req, socket, {
  activeWsSockets,
  shutdownServer,
  onWsConnected,
  onWsDisconnected,
  getHostInfo,
  adhocDiscovery
}) {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n'
    ].join('\r\n')
  );

  let connected = true;
  if (typeof socket.setKeepAlive === 'function') {
    try {
      socket.setKeepAlive(true, 5000);
    } catch (_) {}
  }
  activeWsSockets.add(socket);
  if (onWsConnected) onWsConnected(socket);
  let rxBuffer = Buffer.alloc(0);
  let game = null;
  let legacyMyTeam = 'player1';
  let actionQueue = Promise.resolve();

  const sendJson = (obj) => {
    if (!connected || socket.destroyed) return;
    socket.write(encodeWsText(JSON.stringify(obj)));
  };

  const member = {
    roomCode: null,
    team: null,
    selection: null,
    isConnected: () => connected && !socket.destroyed,
    sendJson
  };

  let hostedAdhocCode = null;
  const stopHostedBroadcastIfOwner = () => {
    if (hostedAdhocCode) {
      hostedAdhocCode = null;
      if (adhocDiscovery) adhocDiscovery.stopAdvertising();
    }
  };

  const cleanupSocket = () => {
    connected = false;
    stopHostedBroadcastIfOwner();
    leaveAdhocRoom(member);
    if (activeWsSockets.delete(socket)) {
      if (onWsDisconnected) onWsDisconnected(socket);
    }
  };

  const hostInfo = getHostInfo ? getHostInfo() : { port: 3000, lanIps: [] };
  sendJson({
    type: 'catalog',
    tankTypes: TANK_TYPES_CATALOG,
    armors: ARMOR_CATALOG,
    turrets: TURRET_CATALOG,
    specials2: SPECIAL2_CATALOG,
    difficulties: DIFFICULTY_CONFIG,
    gridW: GRID_W,
    gridH: GRID_H,
    tankSize: TANK_SIZE,
    hostInfo
  });

  const handleLocalMatchAction = async (msg, viewerTeam, allowRemote = false) => {
    if (!game) return;
    const isActive = () => connected;
    const getRecipients = () => [{ send: sendJson, team: viewerTeam }];
    const emitAll = (m) => broadcastForRecipients(game, m, getRecipients);
    const onEndTurn = () => (game.isPvp
      ? advancePvpTurn(game, emitAll, isActive, 450)
      : beginAITurn(game, sendJson, isActive));

    await executeTurnAction(game, msg, {
      getRecipients,
      notifyActor: allowRemote ? () => {} : sendJson,
      isActive,
      onEndTurn
    });
  };

  const handleAction = async (msg) => {
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'shutdown_server') {
      sendJson({ type: 'server_closing' });
      setTimeout(shutdownServer, 80);
      return;
    }

    if (msg.type === 'create_adhoc_room') {
      game = null;
      const room = createAdhocRoom(msg, member);
      if (room && adhocDiscovery) {
        hostedAdhocCode = room.code;
        const tankMeta = TANK_TYPES_CATALOG[msg.tankTypeId];
        adhocDiscovery.startAdvertising({
          ssid: room.ssid,
          mapStyle: room.mapStyle,
          tankName: (tankMeta && tankMeta.name) || msg.tankTypeId || 'Tanque'
        });
      }
      return;
    }

    if (msg.type === 'join_adhoc_room') {
      game = null;
      stopHostedBroadcastIfOwner();
      const joinedRoom = joinAdhocRoom(msg, member);
      if (joinedRoom && adhocDiscovery) {
        adhocDiscovery.stopAdvertising();
      }
      return;
    }

    if (msg.type === 'leave_adhoc_room') {
      stopHostedBroadcastIfOwner();
      leaveAdhocRoom(member, 'Has salido de la sala Ad-Hoc.');
      sendJson({ type: 'adhoc_left' });
      return;
    }

    if (msg.type === 'discover_adhoc_hosts') {
      if (adhocDiscovery && typeof adhocDiscovery.sendProbe === 'function') {
        adhocDiscovery.sendProbe();
      }
      sendJson({
        type: 'adhoc_hosts',
        hosts: adhocDiscovery ? adhocDiscovery.getDiscoveredHosts() : []
      });
      return;
    }

    if (member.roomCode) {
      await handleAdhocGameAction(member, msg);
      return;
    }

    if (msg.type === 'start_game') {
      game = createMatch(msg);
      sendJson(serializeState(game, 'player'));
      return;
    }

    if (msg.type === 'start_legacy_pvp') {
      legacyMyTeam = msg.myTeam === 'player2' ? 'player2' : 'player1';
      game = createPvpMatch({
        mode: 'pvp_legacy',
        mapStyle: msg.mapStyle || 'bunkers',
        mapSeed: msg.mapSeed,
        p1TankTypeId: msg.p1TankTypeId,
        p1ArmorId: msg.p1ArmorId,
        p2TankTypeId: msg.p2TankTypeId,
        p2ArmorId: msg.p2ArmorId,
        p1Name: 'J1 (Módem)',
        p2Name: 'J2 (Módem)'
      });
      sendJson(serializeState(game, legacyMyTeam));
      return;
    }

    if (msg.type === 'legacy_remote_action') {
      if (!game || game.mode !== 'pvp_legacy' || game.phase !== 'player' || game.endingTurn) return;
      if (msg.actorTeam && msg.actorTeam !== game.activeTeam) return;
      if (!msg.action || typeof msg.action !== 'object') return;
      await handleLocalMatchAction(msg.action, legacyMyTeam, true);
      return;
    }

    if (!game) return;
    if (game.mode === 'pvp_legacy') {
      if (game.activeTeam !== legacyMyTeam) {
        if (msg.type === 'shoot' || msg.type === 'move_to' || msg.type === 'end_turn') {
          sendJson({ type: 'toast', message: 'Espera tu turno: sincronizando jugada del rival por módem.' });
        }
        return;
      }
      await handleLocalMatchAction(msg, legacyMyTeam, false);
      return;
    }

    await handleLocalMatchAction(msg, 'player', false);
  };

  socket.on('data', (chunk) => {
    rxBuffer = Buffer.concat([rxBuffer, chunk]);
    const { messages, remaining } = decodeWsFrames(rxBuffer);
    rxBuffer = remaining;

    for (const frame of messages) {
      if (frame.opcode === 0x8) {
        cleanupSocket();
        socket.end();
        return;
      }
      if (frame.opcode === 0x9) {
        const pong = Buffer.concat([Buffer.from([0x8a, frame.payload.length]), frame.payload]);
        socket.write(pong);
        continue;
      }
      if (frame.opcode === 0x1) {
        try {
          const parsed = JSON.parse(frame.payload.toString('utf8'));
          actionQueue = actionQueue
            .then(() => handleAction(parsed))
            .catch((e) => console.error('Error ejecutando acción WS:', e));
        } catch (e) {
          console.error('Error procesando mensaje WS:', e);
        }
      }
    }
  });

  socket.on('end', cleanupSocket);
  socket.on('close', cleanupSocket);
  socket.on('error', cleanupSocket);
}

module.exports = {
  attachWebSocketSession
};
