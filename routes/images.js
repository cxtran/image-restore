const express = require('express');
const imageController = require('../controllers/imageController');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/upload', verifyToken, imageController.uploadMiddleware, imageController.uploadPhoto);
router.get('/', verifyToken, imageController.listMyImages);
router.get('/shared', verifyToken, imageController.listSharedImages);
router.post('/:id/original', verifyToken, imageController.uploadMiddleware, imageController.replaceOriginalImage);
router.post('/:id/caption', verifyToken, imageController.updateImageCaption);
router.post('/:id/process', verifyToken, imageController.processImage);
router.post('/:id/preview/discard', verifyToken, imageController.discardPreviewImage);
router.post('/:id/accept', verifyToken, imageController.acceptEnhancedImage);
router.post('/:id/share', verifyToken, imageController.setImageShared);
router.delete('/:id/versions', verifyToken, imageController.deleteEnhancedVersions);
router.delete('/:id/enhanced', verifyToken, imageController.deleteAllEnhancedVersions);
router.get('/:id/download', verifyToken, imageController.downloadImage);
router.delete('/:id', verifyToken, imageController.deleteImage);

module.exports = router;
