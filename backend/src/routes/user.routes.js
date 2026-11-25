const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');

// Every user-management route is admin-only.
router.use(authenticate, requireRole('ADMIN'));

router.get('/', userController.list);
router.post('/', userController.create);
router.patch('/:id/password', userController.resetPassword);
router.patch('/:id/active', userController.setActive);

module.exports = router;
