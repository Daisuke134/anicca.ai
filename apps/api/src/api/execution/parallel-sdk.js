import { ParentAgent } from '../../services/parallel-sdk/core/ParentAgent.js';
import { asyncHandler, Errors } from '../../utils/errorHandler.js';

let parentAgent = null;

export default asyncHandler(async (req, res) => {
  if (req.method !== 'POST') {
    throw Errors.badRequest('Method not allowed - use POST');
  }

  const { userId, task } = req.body;
  
  if (!userId || !task) {
    throw Errors.badRequest('Missing required fields', { required: ['userId', 'task'] });
  }
  
  // ParentAgentを初期化（まだない場合）
  if (!parentAgent) {
    console.log('🚀 Initializing ParentAgent for scheduled tasks...');
    parentAgent = new ParentAgent();
    await parentAgent.initialize();
  }
  
  // タスクを実行（環境変数は設定しない）
  console.log(`📋 Executing task for user ${userId}:`, task);
  
  const result = await parentAgent.executeTask({
    ...task,
    userId  // taskオブジェクトに直接userIdを含める
  });
  
  return res.status(200).json({
    success: true,
    result
  });
});