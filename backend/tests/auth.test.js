import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../src/config/prisma');
const env = require('../src/config/env');
const userService = require('../src/services/user.service');
const authController = require('../src/controllers/auth.controller');
const { authenticate, requireRole } = require('../src/middleware/auth.middleware');

const hash = (pw) => bcrypt.hashSync(pw, 4);

function mockRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}

afterEach(() => vi.restoreAllMocks());

describe('login', () => {
  const user = { id: 'u1', username: 'priya', name: 'Priya', role: 'SALES_AGENT', isActive: true, passwordHash: hash('correct-pass') };

  it('signs in with the right username and password', async () => {
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(user);
    const res = mockRes();
    await authController.login({ body: { username: 'Priya', password: 'correct-pass' } }, res, vi.fn());
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(jwt.verify(body.token, env.jwtSecret)).toMatchObject({ id: 'u1', role: 'SALES_AGENT' });
    expect(body.user.passwordHash).toBeUndefined();
  });

  it('rejects a wrong password', async () => {
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(user);
    const res = mockRes();
    await authController.login({ body: { username: 'priya', password: 'wrong-pass' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('no longer accepts the old shared admin123 password for other accounts', async () => {
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(user);
    const res = mockRes();
    await authController.login({ body: { username: 'priya', password: 'admin123' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a turned-off user even with the right password', async () => {
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({ ...user, isActive: false });
    const res = mockRes();
    await authController.login({ body: { username: 'priya', password: 'correct-pass' } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('authenticate middleware', () => {
  it('rejects requests without a token', async () => {
    const res = mockRes();
    const next = vi.fn();
    await authenticate({ headers: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a valid token for a user who was turned off', async () => {
    const token = jwt.sign({ id: 'u1' }, env.jwtSecret);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'u1', isActive: false, role: 'SALES_AGENT' });
    const res = mockRes();
    const next = vi.fn();
    await authenticate({ headers: { authorization: `Bearer ${token}` } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets an active user through and attaches them', async () => {
    const token = jwt.sign({ id: 'u1' }, env.jwtSecret);
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'u1', username: 'priya', isActive: true, role: 'SALES_AGENT', passwordHash: 'x' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const next = vi.fn();
    await authenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({ id: 'u1', username: 'priya' });
    expect(req.user.passwordHash).toBeUndefined();
  });

  it('blocks non-admins from admin-only routes', () => {
    const res = mockRes();
    const next = vi.fn();
    requireRole('ADMIN')({ user: { role: 'SALES_AGENT' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('user management', () => {
  it('creates a user with a hashed password and normal (non-admin) role', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
    const create = vi.spyOn(prisma.user, 'create').mockImplementation(async ({ data }) => ({ id: 'u2', createdAt: new Date(), ...data }));

    const user = await userService.createUser({ username: '  Rahul.K ', password: 'strong-pass', name: 'Rahul' });

    const data = create.mock.calls[0][0].data;
    expect(data.username).toBe('rahul.k');
    expect(data.role).toBe('SALES_AGENT');
    expect(data.passwordHash).not.toBe('strong-pass');
    expect(bcrypt.compareSync('strong-pass', data.passwordHash)).toBe(true);
    expect(user.passwordHash).toBeUndefined();
  });

  it('rejects duplicate usernames, short passwords and bad usernames', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'x' });
    await expect(userService.createUser({ username: 'rahul', password: 'strong-pass' })).rejects.toThrow(/taken/);
    await expect(userService.createUser({ username: 'rahul', password: 'short' })).rejects.toThrow(/at least 8/);
    await expect(userService.createUser({ username: 'a b', password: 'strong-pass' })).rejects.toThrow(/Username/);
  });

  it('never turns off or resets the admin from the users screen', async () => {
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'admin', role: 'ADMIN' });
    await expect(userService.setActive('admin', false, 'someone')).rejects.toThrow(/cannot be turned off/);
    await expect(userService.resetPassword('admin', 'new-strong-pass')).rejects.toThrow(/ADMIN_PASSWORD/);
  });

  it('creates the admin from environment settings and switches off the old dev login', async () => {
    const original = { ...env.admin };
    env.admin.username = 'sankalp';
    env.admin.password = 'test-admin-pass';
    try {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      const create = vi.spyOn(prisma.user, 'create').mockImplementation(async ({ data }) => ({ id: 'a1', ...data }));
      const legacy = vi.spyOn(prisma.user, 'updateMany').mockResolvedValue({ count: 1 });

      await userService.ensureAdminAccount();

      const data = create.mock.calls[0][0].data;
      expect(data).toMatchObject({ username: 'sankalp', role: 'ADMIN', isActive: true });
      expect(bcrypt.compareSync('test-admin-pass', data.passwordHash)).toBe(true);
      expect(legacy).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ email: 'admin@vedron.dev' }),
        data: { isActive: false }
      }));
    } finally {
      Object.assign(env.admin, original);
    }
  });
});

describe('route protection (real Express app)', () => {
  const app = require('../src/app');
  const leadService = require('../src/services/lead.service');
  let server;
  let base;

  const start = () => new Promise(resolve => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  const stop = () => new Promise(resolve => server.close(resolve));
  const tokenFor = (role) => jwt.sign({ id: `id-${role}`, role }, env.jwtSecret);
  const mockUser = (role) => vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: `id-${role}`, username: role.toLowerCase(), name: role, role, isActive: true, passwordHash: 'x' });

  it('locks dashboard APIs without a token', async () => {
    await start();
    try {
      for (const path of ['/api/calls', '/api/callbacks', '/api/analytics/overview', '/api/leads', '/api/users', '/api/auth/me']) {
        const res = await fetch(base + path);
        expect(res.status, path).toBe(401);
      }
    } finally { await stop(); }
  });

  it('only lets the admin into user management', async () => {
    await start();
    try {
      mockUser('SALES_AGENT');
      const asUser = await fetch(`${base}/api/users`, { headers: { Authorization: `Bearer ${tokenFor('SALES_AGENT')}` } });
      expect(asUser.status).toBe(403);

      vi.restoreAllMocks();
      mockUser('ADMIN');
      vi.spyOn(prisma.user, 'findMany').mockResolvedValue([]);
      const asAdmin = await fetch(`${base}/api/users`, { headers: { Authorization: `Bearer ${tokenFor('ADMIN')}` } });
      expect(asAdmin.status).toBe(200);
    } finally { await stop(); }
  });

  it('keeps the public call-status endpoint open and returns only the status', async () => {
    await start();
    try {
      vi.spyOn(leadService, 'getLeadById').mockResolvedValue({
        id: 'lead-1', firstName: 'Secret', phone: '+910000000000',
        callAttempts: [{ status: 'IN_PROGRESS', messages: [{ content: 'private transcript' }] }]
      });
      const res = await fetch(`${base}/api/public/leads/lead-1/call-status`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({ success: true, data: { status: 'IN_PROGRESS' } });
    } finally { await stop(); }
  });
});
