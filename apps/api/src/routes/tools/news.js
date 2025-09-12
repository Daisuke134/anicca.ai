import express from 'express';
import newsHandler from '../../api/tools/web/news.js';

const router = express.Router();

// POST /api/tools/news
router.post('/', (req, res) => newsHandler(req, res));

export default router;

