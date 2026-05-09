import { verifyToken } from '../middleware/auth.js';
import User from '../models/User.js';
import Message from '../models/Message.js';

export function registerSocketHandlers(io) {
  // Auth middleware: chaque socket doit fournir un token JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Missing token'));
    try {
      const payload = verifyToken(token);
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    socket.join(`user:${userId}`);

    try {
      await User.findByIdAndUpdate(userId, { online: true, lastSeen: new Date() });
      socket.broadcast.emit('presence:update', { userId, online: true });
    } catch (e) {
      console.error('[socket] presence online error', e.message);
    }

    // Envoi d'un message 1-a-1
    socket.on('message:send', async ({ recipient, content }, ack) => {
      try {
        if (!recipient || !content?.trim()) throw new Error('recipient and content required');
        const msg = await Message.create({
          sender: userId,
          recipient,
          content: content.trim(),
        });
        io.to(`user:${recipient}`).emit('message:new', msg);
        io.to(`user:${userId}`).emit('message:new', msg);
        ack?.({ ok: true, message: msg });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // Indicateur "en train d'ecrire"
    socket.on('typing', ({ recipient, typing }) => {
      if (!recipient) return;
      io.to(`user:${recipient}`).emit('typing', { from: userId, typing: !!typing });
    });

    socket.on('disconnect', async () => {
      try {
        await User.findByIdAndUpdate(userId, { online: false, lastSeen: new Date() });
        socket.broadcast.emit('presence:update', { userId, online: false });
      } catch (e) {
        console.error('[socket] presence offline error', e.message);
      }
    });
  });
}
