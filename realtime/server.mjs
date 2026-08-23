import { createServer } from 'node:http';
import { Server } from 'socket.io';

const port = Number(process.env.PORT || 4000);
const defaultOrigins = [
  'http://localhost:3000',
  'https://syncroom-music-together.naiski.chatgpt.site',
];
const allowedOrigins = (process.env.ALLOWED_ORIGINS || defaultOrigins.join(','))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const httpServer = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true, service: 'syncroom-realtime' }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: 'Not found' }));
});

const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});

io.use((socket, next) => {
  const code = String(socket.handshake.auth.roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const guestId = String(socket.handshake.auth.guestId || '').slice(0, 80);
  if (code.length !== 6 || !guestId) return next(new Error('invalid room session'));
  socket.data.roomCode = code;
  socket.data.guestId = guestId;
  socket.data.events = [];
  next();
});

io.on('connection', (socket) => {
  const room = `room:${socket.data.roomCode}`;
  socket.join(room);
  socket.to(room).emit('room:refresh', { reason: 'participant-connected' });

  socket.on('room:refresh', (payload = {}) => {
    const now = Date.now();
    socket.data.events = socket.data.events.filter((time) => now - time < 10_000);
    if (socket.data.events.length >= 30) return;
    socket.data.events.push(now);
    socket.to(room).emit('room:refresh', {
      reason: String(payload.reason || 'state-changed').slice(0, 40),
      at: now,
    });
  });

  socket.on('disconnect', () => {
    socket.to(room).emit('room:refresh', { reason: 'participant-disconnected' });
  });
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`SYNCROOM realtime server listening on ${port}`);
});

process.on('SIGTERM', () => {
  io.close(() => httpServer.close(() => process.exit(0)));
});
