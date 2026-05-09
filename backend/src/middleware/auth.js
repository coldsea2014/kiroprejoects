import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
