const express = require('express');
const router = express.Router();
const newItemHandler = require('../router_handler/newItem');


router.get('/home/category', newItemHandler.getAllCategory);

module.exports = router;