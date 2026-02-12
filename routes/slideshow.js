const express = require('express');
const { verifyToken } = require('../middlewares/authMiddleware');
const slideshowController = require('../controllers/slideshowController');

const router = express.Router();

router.get('/music', verifyToken, slideshowController.listMusic);
router.post('/music/upload', verifyToken, slideshowController.uploadMusicMiddleware, slideshowController.uploadMusic);
router.get('/private', verifyToken, slideshowController.listPrivateSlideshows);
router.post('/private', verifyToken, slideshowController.createPrivateSlideshow);
router.get('/private/:id', verifyToken, slideshowController.getPrivateSlideshow);
router.put('/private/:id', verifyToken, slideshowController.updatePrivateSlideshow);
router.delete('/private/:id', verifyToken, slideshowController.deletePrivateSlideshow);

module.exports = router;
