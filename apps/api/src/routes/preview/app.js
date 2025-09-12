import express from 'express';
import previewAppHandler from '../../api/static/preview-app.js';

const router = express.Router();

// GET /api/preview/app/*
router.get('/*', (req, res) => previewAppHandler(req, res));

export default router;

