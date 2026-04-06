const express = require('express');
const router = express.Router();
const hot = require('../router_handler/hot');

router.get('/hot', hot.getHot);

module.exports = router;