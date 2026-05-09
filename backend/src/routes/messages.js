import { Router } from 'express';
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Historique de la conversation avec un autre user
router.get('/:otherUserId', requireAuth, async (req, res) => {
  const { otherUserId } = req.params;
  if (!mongoose.isValidObjectId(otherUserId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  const me = req.userId;
  const messages = await Message.find({
    $or: [
      { sender: me, recipient: otherUserId },
      { sender: otherUserId, recipient: me },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(500);

  res.json({ messages });
});

// Fallback REST pour envoyer un message (Socket.IO reste la voie principale)
router.post('/', requireAuth, async (req, res) => {
  const { recipient, content } = req.body || {};
  if (!recipient || !content) return res.status(400).json({ error: 'recipient and content required' });

  const msg = await Message.create({ sender: req.userId, recipient, content });
  const io = req.app.get('io');
  io.to(`user:${recipient}`).emit('message:new', msg);
  io.to(`user:${req.userId}`).emit('message:new', msg);
  res.status(201).json({ message: msg });
});

export default router;
