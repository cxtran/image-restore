const express = require('express');
const imageController = require('../controllers/imageController');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/upload', verifyToken, imageController.uploadMiddleware, imageController.uploadPhoto);
router.get('/', verifyToken, imageController.listMyImages);
router.post('/:id/process', verifyToken, imageController.processImage);
router.get('/:id/download', verifyToken, imageController.downloadImage);

module.exports = router;
