import express from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { deleteSubscriber } from '../../services/revenuecat/api.js';
import db from '../../db/index.js';

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
    
    // アプリDBの削除（トランザクション内で実行）
    await db.tx(async (t) => {
      // 関連データを削除（外部キー制約の順序に注意）
      await t.none('DELETE FROM usage_sessions WHERE user_id = $1', [userId]);
      await t.none('DELETE FROM profiles WHERE user_id = $1', [userId]);
      await t.none('DELETE FROM devices WHERE user_id = $1', [userId]);
      await t.none('DELETE FROM users WHERE id = $1', [userId]);
    });
    
    return res.status(204).send();
  } catch (error) {
    console.error('[Account Deletion] Error:', error);
    next(error);
  }
});

export default router;

