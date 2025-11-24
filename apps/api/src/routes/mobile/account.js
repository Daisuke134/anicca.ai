import express from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { deleteSubscriber } from '../../services/revenuecat/api.js';
import { pool } from '../../lib/db.js';

const router = express.Router();

// Guideline 5.1.1(v)対応: アカウント削除
router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
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

