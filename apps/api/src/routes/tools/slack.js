import express from 'express';
import slackToolHandler from '../../api/tools/web/slack.js';
import requireAuth from '../../middleware/requireAuth.js';

const router = express.Router();

// POST /api/tools/slack
// 認可ガード（JWT）を入口で適用し、検証結果を req.auth に受け渡す
router.post('/', async (req, res) => {
  // 認可は必須。失敗時はミドルウェア側で適切なレスポンスを返す
  const auth = await requireAuth(req, res);
  if (!auth) return; // 401/500 等は既に送出済み
  // ハンドラが userId 検証に利用できるよう付与
  req.auth = auth;
  return slackToolHandler(req, res);
});

export default router;
