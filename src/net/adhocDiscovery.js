const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');

const DISCOVERY_PORT = 41234;
const MULTICAST_ADDR = '239.255.77.88';
const PROTO_ID = 'tanques_adhoc_v1';
const HOST_TTL_MS = 4500;
const BEACON_INTERVAL_MS = 900;

function isVirtualAdapter(name) {
  return /(vethernet|vmware|virtualbox|vbox|hyper-v|wsl|docker|tailscale|zerotier|hamachi|radmin|tun|tap|loopback)/i.test(name || '');
}

function ipToInt(ip) {
  const parts = String(ip).split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((parts[0] << 24) >>> 0) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function intToIp(num) {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255
  ].join('.');
}

function getNetworkTargets() {
  const ifaces = os.networkInterfaces();
  const lanIps = [];
  const broadcasts = new Set(['255.255.255.255', MULTICAST_ADDR]);

  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!Array.isArray(addrs)) continue;
    const virtual = isVirtualAdapter(name);
    for (const addr of addrs) {
      if (addr.family !== 'IPv4' || addr.internal || addr.address.startsWith('169.254.')) continue;
      lanIps.push({ address: addr.address, virtual });
      if (!virtual && addr.netmask) {
        const ipInt = ipToInt(addr.address);
        const maskInt = ipToInt(addr.netmask);
        if (ipInt !== null && maskInt !== null) {
          const bcast = ((ipInt & maskInt) | (~maskInt >>> 0)) >>> 0;
          broadcasts.add(intToIp(bcast));
        }
      }
    }
  }

  lanIps.sort((a, b) => {
    if (a.virtual !== b.virtual) return a.virtual ? 1 : -1;
    const score = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
    return score(a.address) - score(b.address);
  });

  return {
    ips: lanIps.map((x) => x.address),
    broadcasts: Array.from(broadcasts)
  };
}

function cleanSenderIp(rawIp) {
  const s = String(rawIp || '').trim();
  return s.startsWith('::ffff:') ? s.slice(7) : s;
}

function createAdhocDiscovery() {
  const instanceId = crypto.randomBytes(6).toString('hex');
  const discovered = new Map();
  let socket = null;
  let boundToDiscoveryPort = false;
  let tcpPort = 3000;
  let advertiseMeta = null;
  let beaconTimer = null;

  const sendPacketObj = (obj) => {
    if (!socket) return;
    const buf = Buffer.from(JSON.stringify(obj), 'utf8');
    const { broadcasts } = getNetworkTargets();
    for (const dest of broadcasts) {
      try {
        socket.send(buf, 0, buf.length, DISCOVERY_PORT, dest);
      } catch (_) {}
    }
    try {
      socket.send(buf, 0, buf.length, DISCOVERY_PORT, '127.0.0.1');
    } catch (_) {}
  };

  const buildBeaconObj = (action = 'beacon') => {
    if (!advertiseMeta) return null;
    const { ips } = getNetworkTargets();
    return {
      proto: PROTO_ID,
      action,
      id: instanceId,
      ssid: advertiseMeta.ssid,
      port: advertiseMeta.port || tcpPort,
      ips,
      platform: 'PC',
      mapStyle: advertiseMeta.mapStyle || 'bunkers',
      tankName: advertiseMeta.tankName || 'Tanque',
      ts: Date.now()
    };
  };

  const emitBeacon = (action = 'beacon') => {
    const obj = buildBeaconObj(action);
    if (obj) sendPacketObj(obj);
  };

  const sendProbe = () => {
    sendPacketObj({
      proto: PROTO_ID,
      action: 'probe',
      id: instanceId,
      ts: Date.now()
    });
  };

  const pruneExpired = () => {
    const now = Date.now();
    for (const [key, item] of discovered.entries()) {
      if (now - item.seenAt > HOST_TTL_MS) {
        discovered.delete(key);
      }
    }
  };

  const handleIncoming = (msgBuf, rinfo) => {
    let pkt;
    try {
      pkt = JSON.parse(msgBuf.toString('utf8'));
    } catch (_) {
      return;
    }
    if (!pkt || pkt.proto !== PROTO_ID || !pkt.id) return;

    if (pkt.action === 'probe') {
      if (pkt.id !== instanceId && advertiseMeta && socket && rinfo?.address && rinfo?.port) {
        const replyObj = buildBeaconObj('beacon');
        if (replyObj) {
          const replyBuf = Buffer.from(JSON.stringify(replyObj), 'utf8');
          try {
            socket.send(replyBuf, 0, replyBuf.length, rinfo.port, cleanSenderIp(rinfo.address));
          } catch (_) {}
        }
      }
      return;
    }

    const port = Number(pkt.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) return;

    const senderIp = cleanSenderIp(rinfo?.address) || (Array.isArray(pkt.ips) && pkt.ips[0]) || '127.0.0.1';
    const isSelf = pkt.id === instanceId;
    const { ips: ownIps } = getNetworkTargets();
    const effectiveIp = isSelf
      ? (ownIps[0] || '127.0.0.1')
      : senderIp;
    const key = `${pkt.id}@${effectiveIp}:${port}`;

    if (pkt.action === 'bye') {
      discovered.delete(key);
      return;
    }

    const ssid = String(pkt.ssid || '').trim().slice(0, 32) || `Tanques-${port}`;
    discovered.set(key, {
      key,
      id: String(pkt.id),
      ssid,
      ip: effectiveIp,
      port,
      addr: `${effectiveIp}:${port}`,
      platform: String(pkt.platform || '').toLowerCase() === 'android' ? 'Android' : 'PC',
      mapStyle: String(pkt.mapStyle || 'bunkers'),
      tankName: String(pkt.tankName || 'Tanque'),
      isSelf,
      seenAt: Date.now()
    });
  };

  const start = (listenTcpPort = 3000) => {
    tcpPort = Number(listenTcpPort) || 3000;
    if (socket) return;

    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket = sock;

    sock.on('message', handleIncoming);
    sock.on('error', () => {
      if (!boundToDiscoveryPort) {
        try {
          sock.bind(0);
        } catch (_) {}
      }
    });

    sock.on('listening', () => {
      try {
        sock.setBroadcast(true);
      } catch (_) {}
      try {
        sock.setMulticastTTL(1);
        sock.setMulticastLoopback(true);
      } catch (_) {}

      const { ips } = getNetworkTargets();
      for (const ip of ips) {
        try {
          sock.addMembership(MULTICAST_ADDR, ip);
        } catch (_) {}
      }
      try {
        sock.addMembership(MULTICAST_ADDR);
      } catch (_) {}
    });

    try {
      sock.bind({ port: DISCOVERY_PORT, exclusive: false }, () => {
        boundToDiscoveryPort = true;
      });
    } catch (_) {
      try {
        sock.bind(0);
      } catch (_) {}
    }
  };

  const startAdvertising = ({ ssid, mapStyle, tankName, port }) => {
    advertiseMeta = {
      ssid: String(ssid || '').trim().slice(0, 32) || `Tanques-${os.hostname().slice(0, 14)}`,
      mapStyle: mapStyle || 'bunkers',
      tankName: tankName || 'Tanque',
      port: Number(port) || tcpPort
    };
    if (beaconTimer) clearInterval(beaconTimer);
    emitBeacon('beacon');
    beaconTimer = setInterval(() => emitBeacon('beacon'), BEACON_INTERVAL_MS);
  };

  const stopAdvertising = () => {
    if (beaconTimer) {
      clearInterval(beaconTimer);
      beaconTimer = null;
    }
    if (advertiseMeta) {
      emitBeacon('bye');
      advertiseMeta = null;
    }
  };

  const getDiscoveredHosts = () => {
    pruneExpired();
    return Array.from(discovered.values())
      .map(({ seenAt, ...rest }) => rest)
      .sort((a, b) => {
        if (a.isSelf !== b.isSelf) return a.isSelf ? 1 : -1;
        return a.ssid.localeCompare(b.ssid);
      });
  };

  const stop = () => {
    stopAdvertising();
    if (socket) {
      try {
        socket.close();
      } catch (_) {}
      socket = null;
    }
    discovered.clear();
  };

  return {
    start,
    startAdvertising,
    stopAdvertising,
    sendProbe,
    getDiscoveredHosts,
    stop
  };
}

module.exports = {
  DISCOVERY_PORT,
  MULTICAST_ADDR,
  createAdhocDiscovery
};
