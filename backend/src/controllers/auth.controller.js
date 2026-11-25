const jwt = require('jsonwebtoken');
const env = require('../config/env');
const userService = require('../services/user.service');

class AuthController {
  async login(req, res, next) {
    try {
      // `username` is the login field; `email` is accepted for older clients.
      const identifier = req.body.username || req.body.email;
      const { password } = req.body;
      if (!identifier || !password) {
        return res.status(400).json({ success: false, error: 'Username and password are required' });
      }

      const user = await userService.verifyCredentials(identifier, password);
      if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid username or password' });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, name: user.name },
        env.jwtSecret,
        { expiresIn: '7d' }
      );

      res.json({ success: true, token, user: userService.toPublic(user) });
    } catch (err) {
      next(err);
    }
  }

  async me(req, res) {
    res.json({ success: true, user: req.user });
  }
}

module.exports = new AuthController();
