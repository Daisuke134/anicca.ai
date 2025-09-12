import express from 'express';
import exaSearchHandler from '../../api/tools/web/search.js';

const router = express.Router();

// POST /api/tools/search/exa
router.post('/', (req, res) => exaSearchHandler(req, res));

export default router;

