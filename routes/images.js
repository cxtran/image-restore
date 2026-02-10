const express = require('express');
const imageController = require('../controllers/imageController');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/upload', verifyToken, imageController.uploadMiddleware, imageController.uploadPhoto);
router.get('/', verifyToken, imageController.listMyImages);
router.post('/:id/original', verifyToken, imageController.uploadMiddleware, imageController.replaceOriginalImage);
router.post('/:id/process', verifyToken, imageController.processImage);
router.post('/:id/accept', verifyToken, imageController.acceptEnhancedImage);
router.delete('/:id/versions', verifyToken, imageController.deleteEnhancedVersions);
router.delete('/:id/enhanced', verifyToken, imageController.deleteAllEnhancedVersions);
router.get('/:id/download', verifyToken, imageController.downloadImage);
router.delete('/:id', verifyToken, imageController.deleteImage);

module.exports = router;
