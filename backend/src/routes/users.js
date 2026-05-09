import { Router } from 'express';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Liste des autres fonctionnaires (tout le monde sauf moi)
router.get('/', requireAuth, async (req, res) => {
  const { q } = req.query;
  const filter = { _id: { $ne: req.userId } };
  if (q) {
    filter.$or = [
      { fullName: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { service: { $regex: q, $options: 'i' } },
    ];
  }
  const users = await User.find(filter).sort({ fullName: 1 }).limit(200);
  res.json({ users: users.map((u) => u.toPublicJSON()) });
});

export default router;
