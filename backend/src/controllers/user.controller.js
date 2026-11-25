const userService = require('../services/user.service');
const { UserError } = require('../services/user.service');

function handle(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof UserError) {
        return res.status(err.status).json({ success: false, error: err.message });
      }
      next(err);
    }
  };
}

class UserController {
  list = handle(async (req, res) => {
    res.json({ success: true, data: await userService.listUsers() });
  });

  create = handle(async (req, res) => {
    const { username, password, name } = req.body || {};
    const user = await userService.createUser({ username, password, name });
    res.status(201).json({ success: true, data: user });
  });

  resetPassword = handle(async (req, res) => {
    const user = await userService.resetPassword(req.params.id, (req.body || {}).password);
    res.json({ success: true, data: user });
  });

  setActive = handle(async (req, res) => {
    const user = await userService.setActive(req.params.id, (req.body || {}).isActive, req.user.id);
    res.json({ success: true, data: user });
  });
}

module.exports = new UserController();
