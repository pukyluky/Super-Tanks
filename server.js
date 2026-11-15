const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { PORT, PUBLIC_DIR, MIME_TYPES } = require('./src/config/constants');
const { attachWebSocketSession } = require('./src/net/sessionHandler');

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
let isShuttingDown = false;
let hasHadWsClient = false;
let idleShutdownTimer = null;

function onWsConnected() {
  hasHadWsClient = true;
  if (idleShutdownTimer) {
    clearTimeout(idleShutdownTimer);
    idleShutdownTimer = null;
  }
}

function onWsDisconnected() {
  if (!hasHadWsClient || isShuttingDown || activeWsSockets.size > 0) return;
  if (idleShutdownTimer) clearTimeout(idleShutdownTimer);
  idleShutdownTimer = setTimeout(() => {
    if (!isShuttingDown && activeWsSockets.size === 0) {
      shutdownServer();
    }
  }, 2500);
}

function shutdownServer() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  if (idleShutdownTimer) {
    clearTimeout(idleShutdownTimer);
    idleShutdownTimer = null;
  }
  console.log('Cerrando servidor por petición del jugador...');
  for (const sock of activeWsSockets) {
    try {
      sock.end();
    } catch (_) {}
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 250);
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
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.on('upgrade', (req, socket) => {
  attachWebSocketSession(req, socket, {
    activeWsSockets,
    shutdownServer,
    onWsConnected,
    onWsDisconnected,
    getHostInfo: () => ({ port: PORT, lanIps: getLanIpv4Addresses() })
  });
});

server.listen(PORT, () => {
  console.log(`Servidor de Tanques Táctico 2D escuchando en http://localhost:${PORT}`);
});
