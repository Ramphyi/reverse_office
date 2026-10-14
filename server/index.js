import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { existsSync } from 'node:fs';
import { createApp } from './app.js';
const { app, store, setupKey, session, readable } = createApp();
if (existsSync(new URL('./romania.js', import.meta.url)))
  (await import('./romania.js')).installRomania(app);
app.locals.installFinalHandlers();
const server = createServer(app),
  io = new Server(server, {
    maxHttpBufferSize: 100000,
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(
        null,
        !origin ||
          origin === process.env.APP_ORIGIN ||
          origin === `http://${req.headers.host}` ||
          origin === `https://${req.headers.host}` ||
          (process.env.NODE_ENV !== 'production' &&
            /^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin)),
      );
    },
  });
app.locals.io = io;
io.use((socket, next) => {
  const user = session(socket.request);
  if (!user || user.must_change_password || socket.handshake.auth.csrf !== user.csrf)
    return next(Error('Unauthorized'));
  socket.data.user = user;
  next();
});
io.on('connection', (socket) => {
  socket.use((event, next) => {
    const user = session(socket.request);
    if (!user || user.must_change_password) {
      socket.disconnect(true);
      return;
    }
    socket.data.user = user;
    next();
  });
  const canJoin = (room) => {
    const event = store.get('events', room);
    return event && readable(socket.data.user, 'events', event);
  };
  socket.on('channel:join', (id) => {
    if (readable(socket.data.user, 'channels', store.get('channels', id)))
      socket.join(`channel:${id}`);
  });
  socket.on('meeting:join', (id) => {
    if (typeof id !== 'string' || !canJoin(id)) return;
    for (const room of socket.rooms) if (room.startsWith('meeting:')) socket.leave(room);
    const room = `meeting:${id}`,
      members = [...(io.sockets.adapter.rooms.get(room) ?? [])].map((sid) => ({
        id: sid,
        name: io.sockets.sockets.get(sid)?.data.user.name,
      }));
    if (members.length >= 6) {
      socket.emit('meeting:error', 'This local meeting supports up to six participants.');
      return;
    }
    socket.join(room);
    socket.emit('meeting:peers', members);
    socket.to(room).emit('meeting:joined', { id: socket.id, name: socket.data.user.name });
  });
  socket.on('meeting:signal', ({ to, room, signal }) => {
    const target = io.sockets.sockets.get(to);
    if (
      !canJoin(room) ||
      !socket.rooms.has(`meeting:${room}`) ||
      !target?.rooms.has(`meeting:${room}`) ||
      !readable(target.data.user, 'events', store.get('events', room))
    )
      return;
    target.emit('meeting:signal', { from: socket.id, room, signal, name: socket.data.user.name });
  });
  socket.on('meeting:leave', () => {
    for (const room of socket.rooms)
      if (room.startsWith('meeting:')) {
        socket.to(room).emit('meeting:left', socket.id);
        socket.leave(room);
      }
  });
  socket.on('disconnecting', () => {
    for (const room of socket.rooms)
      if (room.startsWith('meeting:')) socket.to(room).emit('meeting:left', socket.id);
  });
});
const port = Number(process.env.PORT || 3001);
server.listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log(`Reverse Office: http://localhost:${port}`);
  if (!store.users().length) console.log(`First-run setup key: ${setupKey}`);
});
const reap = setInterval(() => {
  for (const socket of io.sockets.sockets.values()) {
    const current = session(socket.request);
    if (!current) {
      socket.disconnect(true);
      continue;
    }
    for (const room of socket.rooms)
      if (
        room.startsWith('meeting:') &&
        !readable(current, 'events', store.get('events', room.slice(8)))
      ) {
        socket.to(room).emit('meeting:left', socket.id);
        socket.disconnect(true);
      }
  }
}, 30000);
reap.unref();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    io.close();
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
