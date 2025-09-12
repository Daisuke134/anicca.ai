// Worker音声割り込みエンドポイント
// VADが音声を検知したときにWorker SDKを一時停止

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { workerId, action } = req.body;
    
    if (!workerId || !action) {
      return res.status(400).json({ error: 'workerId and action are required' });
    }

    console.log(`🛑 Worker interrupt: ${workerId} - ${action}`);

    // Worker SDKの処理を制御
    switch (action) {
      case 'pause':
        // Worker SDKの実行を一時停止
        // ParentAgentのWorker管理機能を使用
        await pauseWorker(workerId);
        return res.status(200).json({
          success: true,
          message: 'Worker paused',
          workerId: workerId
        });

      case 'resume':
        // Worker SDKの実行を再開
        await resumeWorker(workerId);
        return res.status(200).json({
          success: true,
          message: 'Worker resumed',
          workerId: workerId
        });

      case 'cancel':
        // Worker SDKの実行をキャンセル
        await cancelWorker(workerId);
        return res.status(200).json({
          success: true,
          message: 'Worker cancelled',
          workerId: workerId
        });

      default:
        return res.status(400).json({
          error: 'Invalid action',
          validActions: ['pause', 'resume', 'cancel']
        });
    }

  } catch (error) {
    console.error('❌ Worker interrupt error:', error);
    return res.status(500).json({
      error: 'Interrupt failed',
      details: error.message
    });
  }
}

// Worker制御関数（ParentAgentと連携）
async function pauseWorker(workerId) {
  // WorkerのタスクキューをPause
  console.log(`⏸️ Pausing worker: ${workerId}`);
  // TODO: ParentAgent経由でWorkerを一時停止
  // parentAgent.pauseWorker(workerId);
}

async function resumeWorker(workerId) {
  // WorkerのタスクキューをResume
  console.log(`▶️ Resuming worker: ${workerId}`);
  // TODO: ParentAgent経由でWorkerを再開
  // parentAgent.resumeWorker(workerId);
}

async function cancelWorker(workerId) {
  // Workerのタスクをキャンセル
  console.log(`❌ Cancelling worker: ${workerId}`);
  // TODO: ParentAgent経由でWorkerをキャンセル
  // parentAgent.cancelWorker(workerId);
}