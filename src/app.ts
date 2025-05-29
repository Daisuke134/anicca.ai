import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import dotenv from 'dotenv';
import { ScreenCaptureService } from './services/screenCapture';
import { GeminiRestService } from './services/geminiRest';
import { DatabaseService } from './services/database';
import { HighlightsManager } from './services/highlightsManager';

// 環境変数を読み込み
dotenv.config();

// メイン関数
async function main() {
  const app = express();
  const server = createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // 静的ファイルの配信
  app.use(express.static(path.join(__dirname, '../public')));

  // APIキーの確認
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('❌ GOOGLE_API_KEY not found in environment variables');
    process.exit(1);
  }

  console.log('🔑 API Key loaded:', apiKey.substring(0, 10) + '...');

  // サービスの初期化
  const database = new DatabaseService();
  await database.init(); // Supabase初期化
  const screenCapture = new ScreenCaptureService(8000); // 約8秒間隔
  const geminiService = new GeminiRestService(apiKey, database);
  const highlightsManager = new HighlightsManager(database, geminiService);

  // WebSocket接続の管理
  let currentLanguage = 'en'; // デフォルト言語（フロントエンドと合わせる）

  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    socket.on('set-language', (data) => {
      currentLanguage = data.language || 'ja';
      console.log('🌍 Language set to:', currentLanguage);
    });

    socket.on('start-narration', async () => {
      try {
        console.log('🚀 Starting anicca narration...');
        
        // スクリーンキャプチャ開始
        await screenCapture.startCapture();
        
        socket.emit('narration-started', { 
          message: 'anicca AGI実況システムが開始されました',
          timestamp: Date.now()
        });
        
      } catch (error) {
        console.error('❌ Error starting narration:', error);
        socket.emit('error', { 
          message: '実況開始に失敗しました',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    socket.on('stop-narration', async () => {
      console.log('⏹️ Stopping narration...');
      screenCapture.stopCapture();
      
      // 実況停止時にハイライトを一括更新（バックグラウンド、現在の言語で）
      highlightsManager.updateAllHighlights(currentLanguage).catch(err => {
        console.error('❌ Error updating highlights after stop:', err);
      });
      
      socket.emit('narration-stopped', { 
        message: 'anicca実況システムが停止されました',
        timestamp: Date.now()
      });
    });



    socket.on('get-state', () => {
      const state = geminiService.getCurrentState();
      socket.emit('current-state', state);
    });

    // 接続時に最新の理解を送信
    socket.emit('understanding-update', {
      understanding: geminiService.getCurrentState().currentUnderstanding
    });

    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected:', socket.id);
      screenCapture.stopCapture();
    });
  });

  // スクリーンキャプチャのイベントリスナー
  screenCapture.on('frame', async (frame) => {
    try {
      console.log('📸 Frame captured, analyzing with anicca...');
      
      // Gemini APIで分析（言語パラメータ付き）
      const commentary = await geminiService.analyzeScreen(frame, currentLanguage);
      
      // クライアントに送信
      io.emit('commentary', {
        ...commentary,
        timestamp: Date.now(),
        frameTimestamp: frame.timestamp
      });
      
      console.log('💬 Commentary sent:', commentary.commentary.substring(0, 100) + '...');
      
    } catch (error) {
      console.error('❌ Error processing frame:', error);
      io.emit('error', { 
        message: 'フレーム処理中にエラーが発生しました',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  screenCapture.on('error', (error) => {
    console.error('❌ Screen capture error:', error);
    io.emit('error', { 
      message: 'スクリーンキャプチャエラー',
      error: error.message 
    });
  });

  // ルート
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });

  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: Date.now(),
      services: {
        screenCapture: screenCapture.isActive(),
        gemini: 'ready'
      }
    });
  });

  // 日別データAPI
  app.get('/api/observations/:date', async (req, res) => {
    try {
      const { date } = req.params;
      
      // 日付形式の検証 (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }
      
      const observations = await database.getObservationsByDate(date);
      
      return res.json({
        date,
        count: observations.length,
        observations: observations.map(obs => ({
          id: obs.id,
          timestamp: obs.timestamp,
          hour: obs.hour,
          commentary: obs.commentary,
          websiteName: obs.website_name,
          actionCategory: obs.action_category,
          prediction: obs.prediction_data,
          verification: obs.verification_data,
          understanding: obs.current_understanding
        }))
      });
      
    } catch (error) {
      console.error('❌ Error fetching observations:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // 最近の観察データAPI
  app.get('/api/observations/recent/:limit?', async (req, res) => {
    try {
      const limit = parseInt(req.params.limit || '10');
      const observations = await database.getRecentObservations(limit);
      
      return res.json({
        count: observations.length,
        observations: observations.map(obs => ({
          id: obs.id,
          timestamp: obs.timestamp,
          date: obs.date,
          hour: obs.hour,
          commentary: obs.commentary,
          websiteName: obs.website_name,
          actionCategory: obs.action_category,
          prediction: obs.prediction_data,
          verification: obs.verification_data,
          understanding: obs.current_understanding
        }))
      });
      
    } catch (error) {
      console.error('❌ Error fetching recent observations:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // 統計情報API
  app.get('/api/stats', async (req, res) => {
    try {
      const totalCount = await database.getObservationCount();
      
      return res.json({
        totalObservations: totalCount,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error('❌ Error fetching stats:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ハイライト取得API（賢いキャッシュ版）
  app.get('/api/highlights/:period/:date?', async (req, res) => {
    try {
      const { period, date } = req.params;
      const language = req.query.language as string || 'en'; // クエリパラメータから言語を取得
      
      if (!['daily', 'weekly', 'monthly'].includes(period)) {
        return res.status(400).json({ error: 'Invalid period. Use daily, weekly, or monthly' });
      }
      
      const targetDate = date || new Date().toISOString().split('T')[0];
      
      // ハイライトマネージャーから賢く取得（キャッシュ優先、言語パラメータ付き）
      const highlights = await highlightsManager.getHighlights(period, targetDate, language);
      
      // 期間情報を計算（レスポンス用）
      let startDate, endDate;
      switch (period) {
        case 'daily':
          startDate = endDate = targetDate;
          break;
        case 'weekly':
          const weekStart = new Date(targetDate);
          weekStart.setDate(weekStart.getDate() - 6);
          startDate = weekStart.toISOString().split('T')[0];
          endDate = targetDate;
          break;
        case 'monthly':
          const monthStart = new Date(targetDate);
          monthStart.setDate(monthStart.getDate() - 29);
          startDate = monthStart.toISOString().split('T')[0];
          endDate = targetDate;
          break;
      }
      
      return res.json({
        period,
        startDate,
        endDate,
        highlights,
        cached: highlights.length > 0 // キャッシュヒットの可能性を示唆
      });
      
    } catch (error) {
      console.error('❌ Error getting highlights:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // サーバー起動
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log('🚀 anicca AGI Server started!');
    console.log(`📱 Web UI: http://localhost:${PORT}`);
    console.log('🤖 Phase 1: 基礎実況システム (短期記憶)');
    console.log('⏱️  キャプチャ間隔: 約8秒');
    console.log('🧠 AI: gemini-2.0-flash-exp');
  });

  // グレースフルシャットダウン
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    screenCapture.stopCapture();
    database.close();
    server.close(() => {
      console.log('✅ anicca AGI Server stopped');
      process.exit(0);
    });
  });

  return { app, server };
}

// メイン関数を実行
main().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}); 