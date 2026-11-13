const http = require('http');
const fs = require('fs');
const path = require('path');

const { PORT, PUBLIC_DIR, MIME_TYPES } = require('./src/config/constants');
const { attachWebSocketSession } = require('./src/net/sessionHandler');

const activeWsSockets = new Set();
let isShuttingDown = false;

function shutdownServer() {
  if (isShuttingDown) return;
  isShuttingDown = true;
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
  attachWebSocketSession(req, socket, { activeWsSockets, shutdownServer });
});

server.listen(PORT, () => {
  console.log(`Servidor de Tanques Táctico 2D escuchando en http://localhost:${PORT}`);
});
