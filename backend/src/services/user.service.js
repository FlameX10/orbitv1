const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const env = require('../config/env');
const logger = require('../config/logger');

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_ROUNDS = 10;
const LEGACY_DEV_ADMIN_EMAIL = 'admin@vedron.dev';

class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

class UserService {
  normalizeUsername(username) {
    return String(username || '').trim().toLowerCase();
  }

  validateUsername(username) {
    if (!USERNAME_PATTERN.test(username)) {
      throw new UserError('Username must be 3–32 characters: letters, numbers, dot, dash or underscore.');
    }
  }

  validatePassword(password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new UserError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
  }

  toPublic(user) {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt
    };
  }

  /**
   * Check a login. `identifier` is a username (or a legacy email).
   * Returns the user, or null for wrong credentials / inactive accounts.
   */
  async verifyCredentials(identifier, password) {
    const id = String(identifier || '').trim();
    if (!id || typeof password !== 'string' || !password) return null;

    const user = await prisma.user.findFirst({
      where: { OR: [{ username: id.toLowerCase() }, { email: id }] }
    });
    if (!user || !user.isActive) return null;

    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  }

  /**
   * Create the admin from ADMIN_USERNAME / ADMIN_PASSWORD, or keep its password in
   * sync if it already exists. Also switches off the old shared dev admin login.
   */
  async ensureAdminAccount() {
    const { username, password } = env.admin;
    if (!username || !password) {
      logger.warn('ADMIN_USERNAME / ADMIN_PASSWORD are not set; no admin account was created or updated.');
      return null;
    }

    let admin = await prisma.user.findUnique({ where: { username } });
    if (!admin) {
      admin = await prisma.user.create({
        data: {
          username,
          name: username.charAt(0).toUpperCase() + username.slice(1),
          passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
          role: 'ADMIN',
          isActive: true
        }
      });
      logger.info(`Admin account [${username}] created.`);
    } else {
      const data = {};
      if (!(await bcrypt.compare(password, admin.passwordHash))) {
        data.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      }
      if (admin.role !== 'ADMIN') data.role = 'ADMIN';
      if (!admin.isActive) data.isActive = true;
      if (Object.keys(data).length) {
        admin = await prisma.user.update({ where: { id: admin.id }, data });
        logger.info(`Admin account [${username}] updated from environment settings.`);
      }
    }

    // The old shared dev login (admin@vedron.dev / admin123) must not stay usable.
    const legacy = await prisma.user.updateMany({
      where: { email: LEGACY_DEV_ADMIN_EMAIL, isActive: true, NOT: { id: admin.id } },
      data: { isActive: false }
    });
    if (legacy.count) logger.warn('Legacy dev admin login was switched off.');

    return admin;
  }

  async listUsers() {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map(u => this.toPublic(u));
  }

  async createUser({ username, password, name }) {
    const normalized = this.normalizeUsername(username);
    this.validateUsername(normalized);
    this.validatePassword(password);

    const existing = await prisma.user.findUnique({ where: { username: normalized } });
    if (existing) throw new UserError('That username is already taken.', 409);

    const user = await prisma.user.create({
      data: {
        username: normalized,
        name: String(name || '').trim() || normalized,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        role: 'SALES_AGENT',
        isActive: true
      }
    });
    return this.toPublic(user);
  }

  async resetPassword(userId, password) {
    this.validatePassword(password);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UserError('User not found.', 404);
    if (user.role === 'ADMIN') {
      throw new UserError('The admin password is managed in the server settings (ADMIN_PASSWORD).', 403);
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) }
    });
    return this.toPublic(updated);
  }

  async setActive(userId, isActive, actingUserId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UserError('User not found.', 404);
    if (user.id === actingUserId || user.role === 'ADMIN') {
      throw new UserError('The admin account cannot be turned off.', 403);
    }
    const updated = await prisma.user.update({ where: { id: userId }, data: { isActive: Boolean(isActive) } });
    return this.toPublic(updated);
  }
}

module.exports = new UserService();
module.exports.UserError = UserError;
