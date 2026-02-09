const express = require('express');
const adminController = require('../controllers/adminController');
const { verifyToken, requireAdmin } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(verifyToken, requireAdmin);
router.get('/users', adminController.listUsers);
router.post('/users', adminController.createUser);
router.patch('/users/:id/password', adminController.resetUserPassword);
router.delete('/users/:id', adminController.deleteUser);
router.get('/images', adminController.listImages);
router.delete('/images/:id', adminController.deleteImageAnyUser);

module.exports = router;
