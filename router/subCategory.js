const express = require('express');
const router = express.Router();
const subCategoryHandler = require('../router_handler/subCategory');

// 根据【请求参数 categoryId】查询对应一级分类的详情（含二级分类 + 商品）
router.get('/home/category/info', subCategoryHandler.getCategoryInfo);

module.exports = router;
