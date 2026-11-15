const { createPvpMatch, serializeState, advancePvpTurn } = require('../engine/match');
const { broadcastForRecipients, executeTurnAction } = require('../engine/turnExecutor');

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();

function generateRoomCode() {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return String(Date.now()).slice(-4);
}

function getRoomRecipients(room) {
  const list = [];
  if (room.host && room.host.isConnected()) {
    list.push({ send: room.host.sendJson, team: 'player1' });
  }
  if (room.guest && room.guest.isConnected()) {
    list.push({ send: room.guest.sendJson, team: 'player2' });
  }
  return list;
}

function leaveAdhocRoom(member, reason) {
  const code = member.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  member.roomCode = null;
  member.team = null;
  if (!room) return;

  const wasHost = room.host === member;
  const peer = wasHost ? room.guest : room.host;

  if (wasHost) {
    rooms.delete(code);
    if (peer) {
      peer.roomCode = null;
      peer.team = null;
      if (peer.isConnected()) {
        peer.sendJson({
          type: 'adhoc_peer_left',
          message: reason || 'El Host cerró la sala Ad-Hoc.'
        });
      }
    }
    return;
  }

  room.guest = null;
  room.game = null;
  if (peer && peer.isConnected()) {
    peer.sendJson({
      type: 'adhoc_peer_left',
      message: reason || 'El Invitado salió de la sala Ad-Hoc.'
    });
  }
}

function sanitizeRoomSsid(rawSsid, code) {
  const clean = String(rawSsid || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 32);
  return clean || `Tanques-${code}`;
}

function createAdhocRoom(msg, hostMember) {
  leaveAdhocRoom(hostMember, 'Host creó una nueva sala.');
  const code = generateRoomCode();
  const ssid = sanitizeRoomSsid(msg.ssid, code);
  hostMember.roomCode = code;
  hostMember.team = 'player1';
  hostMember.selection = {
    tankTypeId: msg.tankTypeId,
    armorId: msg.armorId,
    playerName: msg.playerName || null
  };

  const room = {
    code,
    ssid,
    mapStyle: msg.mapStyle || 'bunkers',
    host: hostMember,
    guest: null,
    game: null
  };
  rooms.set(code, room);

  hostMember.sendJson({
    type: 'adhoc_room_created',
    code,
    ssid,
    mapStyle: room.mapStyle,
    myTeam: 'player1'
  });
  return room;
}

function startRoomMatch(room) {
  room.game = createPvpMatch({
    mode: 'pvp_adhoc',
    mapStyle: room.mapStyle,
    p1TankTypeId: room.host.selection.tankTypeId,
    p1ArmorId: room.host.selection.armorId,
    p2TankTypeId: room.guest.selection.tankTypeId,
    p2ArmorId: room.guest.selection.armorId,
    p1Name: room.host.selection.playerName,
    p2Name: room.guest.selection.playerName
  });

  room.host.sendJson(serializeState(room.game, 'player1'));
  room.guest.sendJson(serializeState(room.game, 'player2'));
}

function joinAdhocRoom(msg, guestMember) {
  const code = String(msg.code || '').trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    guestMember.sendJson({ type: 'adhoc_error', message: `Sala "${code}" no encontrada en este Host.` });
    return null;
  }
  if (room.guest) {
    guestMember.sendJson({ type: 'adhoc_error', message: `La sala "${code}" ya está completa (2/2).` });
    return null;
  }
  if (!room.host || !room.host.isConnected()) {
    rooms.delete(code);
    guestMember.sendJson({ type: 'adhoc_error', message: 'El Host de esta sala ya no está conectado.' });
    return null;
  }

  leaveAdhocRoom(guestMember, 'El jugador cambió de sala.');
  guestMember.roomCode = code;
  guestMember.team = 'player2';
  guestMember.selection = {
    tankTypeId: msg.tankTypeId,
    armorId: msg.armorId,
    playerName: msg.playerName || null
  };
  room.guest = guestMember;

  room.host.sendJson({ type: 'adhoc_room_joined', code, myTeam: 'player1', role: 'host' });
  guestMember.sendJson({ type: 'adhoc_room_joined', code, myTeam: 'player2', role: 'guest' });
  startRoomMatch(room);
  return room;
}

async function handleAdhocGameAction(member, msg) {
  const room = rooms.get(member.roomCode);
  if (!room || !room.game) return false;
  const game = room.game;

  if (msg.type === 'pvp_rematch') {
    if (!room.host?.isConnected() || !room.guest?.isConnected()) {
      member.sendJson({ type: 'toast', message: 'Falta el rival para iniciar revancha.' });
      return true;
    }
    if (msg.tankTypeId && msg.armorId) {
      member.selection = {
        tankTypeId: msg.tankTypeId,
        armorId: msg.armorId,
        playerName: member.selection?.playerName || null
      };
    }
    if (member.team === 'player1' && msg.mapStyle) {
      room.mapStyle = msg.mapStyle;
    }
    startRoomMatch(room);
    return true;
  }

  if (game.activeTeam !== member.team) {
    if (msg.type === 'shoot' || msg.type === 'move_to' || msg.type === 'end_turn') {
      member.sendJson({ type: 'toast', message: 'Espera tu turno: está actuando tu rival.' });
    }
    return true;
  }

  const getRecipients = () => getRoomRecipients(room);
  const isActive = () => Boolean(rooms.get(room.code) && (room.host?.isConnected() || room.guest?.isConnected()));
  const emitAll = (m) => broadcastForRecipients(game, m, getRecipients);

  await executeTurnAction(game, msg, {
    getRecipients,
    notifyActor: (m) => member.sendJson(m),
    isActive,
    onEndTurn: () => advancePvpTurn(game, emitAll, isActive)
  });
  return true;
}

module.exports = {
  createAdhocRoom,
  joinAdhocRoom,
  leaveAdhocRoom,
  handleAdhocGameAction
};
