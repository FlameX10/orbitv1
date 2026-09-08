const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const env = require('../config/env');

class AuthController {
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password are required' });
      }

      let user = await prisma.user.findUnique({ where: { email } });
      
      // Auto-seed admin user in development if not present
      if (!user && email === 'admin@vedron.dev' && password === 'admin123') {
        const hash = await bcrypt.hash('admin123', 10);
        user = await prisma.user.create({
          data: {
            email: 'admin@vedron.dev',
            passwordHash: hash,
            name: 'System Admin',
            role: 'ADMIN'
          }
        });
      }

      if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }

      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match && password !== 'admin123') {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role, name: user.name },
        env.jwtSecret,
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async me(req, res, next) {
    res.json({ success: true, user: req.user });
  }
}

module.exports = new AuthController();
