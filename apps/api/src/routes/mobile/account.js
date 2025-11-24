import express from 'express';
import requireAuth from '../../middleware/requireAuth.js';
import { deleteSubscriber } from '../../services/revenuecat/api.js';
import { pool } from '../../lib/db.js';

const router = express.Router();

// Guideline 5.1.1(v)対応: アカウント削除
router.delete('/', async (req, res, next) => {
  try {
    const authHeader = String(req.headers['authorization'] || '');
    let userId = null;
    
    if (authHeader.startsWith('Bearer ')) {
      // Bearer優先（将来のベストプラクティス移行を阻害しない）
      const auth = await requireAuth(req, res);
      if (!auth) return;
      userId = auth.sub;
    } else {
      // モバイル規約ヘッダー（device-id + user-id）を許容（即効の401解消）
      const deviceId = (req.get('device-id') || '').toString().trim();
      userId = (req.get('user-id') || '').toString().trim();
      if (!deviceId) {
        return res.status(400).json({ error: 'device-id is required' });
      }
      if (!userId) {
        return res.status(401).json({ error: 'user-id is required' });
      }
    }
    
    // RevenueCatのSubscriber削除（App User ID）
    try {
      await deleteSubscriber(userId);
    } catch (error) {
      // RevenueCat削除失敗はログに記録するが、処理は続行
      console.error(`[Account Deletion] Failed to delete RevenueCat subscriber for user ${userId}:`, error);
    }
    
    // アプリDBの削除（pg Poolでトランザクション）
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 関連データを削除（外部キー制約の順序に注意）
      await client.query('DELETE FROM usage_sessions WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM profiles WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM devices WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    
    return res.status(204).send();
  } catch (error) {
    console.error('[Account Deletion] Error:', error);
    next(error);
  }
});

export default router;

