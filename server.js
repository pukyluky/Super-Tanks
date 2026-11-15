const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { PORT, PUBLIC_DIR, MIME_TYPES } = require('./src/config/constants');
const { attachWebSocketSession } = require('./src/net/sessionHandler');
const { createAdhocDiscovery } = require('./src/net/adhocDiscovery');

const adhocDiscovery = createAdhocDiscovery();

function isVirtualAdapter(name) {
  return /(vethernet|vmware|virtualbox|vbox|hyper-v|wsl|docker|tailscale|zerotier|hamachi|radmin|tun|tap|loopback)/i.test(name || '');
}

function getLanIpv4Addresses() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!Array.isArray(addrs)) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('169.254.')) {
        ips.push({ name, address: addr.address, virtual: isVirtualAdapter(name) });
      }
    }
  }
  ips.sort((a, b) => {
    if (a.virtual !== b.virtual) return a.virtual ? 1 : -1;
    const score = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
    return score(a.address) - score(b.address);
  });
  return ips.map((x) => x.address);
}

const activeWsSockets = new Set();
const localWsSockets = new Set();
let isShuttingDown = false;
let hasHadWsClient = false;
let hasHadLocalWsClient = false;
let idleShutdownTimer = null;

function isLoopbackAddress(addr) {
  const raw = String(addr || '').trim();
  return raw === '127.0.0.1' || raw === '::1' || raw === '::ffff:127.0.0.1';
}

function scheduleIdleShutdown(delayMs = 1500) {
  if (isShuttingDown) return;
  if (idleShutdownTimer) clearTimeout(idleShutdownTimer);
  idleShutdownTimer = setTimeout(() => {
    if (isShuttingDown) return;
    if ((hasHadLocalWsClient && localWsSockets.size === 0) || (hasHadWsClient && activeWsSockets.size === 0)) {
      shutdownServer();
    }
  }, delayMs);
}

function onWsConnected(socket) {
  hasHadWsClient = true;
  if (socket && isLoopbackAddress(socket.remoteAddress)) {
    hasHadLocalWsClient = true;
    localWsSockets.add(socket);
  }
  if (idleShutdownTimer) {
    clearTimeout(idleShutdownTimer);
    idleShutdownTimer = null;
  }
}

function onWsDisconnected(socket) {
  if (socket) localWsSockets.delete(socket);
  if (!hasHadWsClient || isShuttingDown) return;
  if (hasHadLocalWsClient) {
    if (localWsSockets.size > 0) return;
  } else if (activeWsSockets.size > 0) {
    return;
  }
  scheduleIdleShutdown(1500);
}

function shutdownServer() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  if (idleShutdownTimer) {
    clearTimeout(idleShutdownTimer);
    idleShutdownTimer = null;
  }
  console.log('Cerrando servidor automáticamente tras salir del juego...');
  adhocDiscovery.stop();
  for (const sock of activeWsSockets) {
    try {
      sock.destroy();
    } catch (_) {}
  }
  activeWsSockets.clear();
  localWsSockets.clear();
  if (typeof server.closeAllConnections === 'function') {
    try {
      server.closeAllConnections();
    } catch (_) {}
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 200);
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (req.method === 'GET' && urlPath === '/api/host-info') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ port: PORT, lanIps: getLanIpv4Addresses() }));
    return;
  }
  if (req.method === 'POST' && urlPath === '/api/shutdown') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, message: 'Servidor cerrándose...' }));
    setTimeout(shutdownServer, 80);
    return;
  }
  if (req.method === 'POST' && urlPath === '/api/client-closing') {
    const isLocal = isLoopbackAddress(req.socket && req.socket.remoteAddress);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    if (isLocal && hasHadLocalWsClient) {
      scheduleIdleShutdown(1500);
    }
    return;
  }
  if (urlPath === '/api/display-settings') {
    const winApi = process.env.TANQUES_WINDOW_API;
    if (req.method === 'GET') {
      if (!winApi) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, nativeWindow: false }));
        return;
      }
      const fwd = http.request(`${winApi}status`, { method: 'GET', timeout: 1500 }, (upRes) => {
        const chunks = [];
        upRes.on('data', (c) => chunks.push(c));
        upRes.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(Buffer.concat(chunks));
        });
      });
      fwd.on('error', () => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, nativeWindow: false }));
      });
      fwd.end();
      return;
    }
    if (req.method === 'POST') {
      const reqChunks = [];
      req.on('data', (c) => reqChunks.push(c));
      req.on('end', () => {
        let parsed = {};
        try {
          parsed = JSON.parse(Buffer.concat(reqChunks).toString('utf8') || '{}');
        } catch (_) {}
        const displayMode = ['windowed', 'borderless', 'fullscreen'].includes(parsed.displayMode)
          ? parsed.displayMode
          : 'windowed';
        const resolution = typeof parsed.resolution === 'string' && /^(auto|\d{3,4}x\d{3,4})$/.test(parsed.resolution)
          ? parsed.resolution
          : '1340x880';

        if (!winApi) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, nativeWindow: false, displayMode, resolution }));
          return;
        }
        const payload = JSON.stringify({ displayMode, resolution });
        const fwd = http.request(
          `${winApi}apply`,
          {
            method: 'POST',
            timeout: 2000,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Length': Buffer.byteLength(payload)
            }
          },
          (upRes) => {
            const chunks = [];
            upRes.on('data', (c) => chunks.push(c));
            upRes.on('end', () => {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(Buffer.concat(chunks));
            });
          }
        );
        fwd.on('error', () => {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true, nativeWindow: false, displayMode, resolution }));
        });
        fwd.end(payload);
      });
      return;
    }
  }

  const safePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const fullPath = path.join(PUBLIC_DIR, safePath);

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(content);
  });
});

server.on('upgrade', (req, socket) => {
  attachWebSocketSession(req, socket, {
    activeWsSockets,
    shutdownServer,
    onWsConnected,
    onWsDisconnected,
    getHostInfo: () => ({ port: PORT, lanIps: getLanIpv4Addresses() }),
    adhocDiscovery
  });
});

server.listen(PORT, () => {
  adhocDiscovery.start(PORT);
  console.log(`Servidor de Tanques Táctico 2D escuchando en http://localhost:${PORT}`);
});
