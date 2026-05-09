import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import { Server as SocketServer } from 'socket.io';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import messageRoutes from './routes/messages.js';
import { registerSocketHandlers } from './socket/index.js';

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/communechat';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'communechat-api' }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: CLIENT_URL, credentials: true },
});

registerSocketHandlers(io);
app.set('io', io);

async function start() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('[db] connected to MongoDB');
    server.listen(PORT, () => {
      console.log(`[api] listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[db] connection error', err.message);
    process.exit(1);
  }
}

start();
