const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../config/prisma');
const userService = require('../services/user.service');

/**
 * Verify a JWT and return the current, active user (or null).
 * The database is checked on every call so turned-off users lose access at once.
 */
async function resolveUserFromToken(token) {
  if (!token) return null;
  let decoded;
  try {
    decoded = jwt.verify(token, env.jwtSecret);
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user || !user.isActive) return null;
  return userService.toPublic(user);
}

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      return res.status(401).json({ success: false, error: 'Please sign in to continue' });
    }
    const user = await resolveUserFromToken(token);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Your session has expired. Please sign in again.' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Only an admin can do this' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, resolveUserFromToken };
