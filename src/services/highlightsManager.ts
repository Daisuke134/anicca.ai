import { DatabaseService } from './database';
import { GeminiRestService } from './geminiRest';

export class HighlightsManager {
  private database: DatabaseService;
  private geminiService: GeminiRestService;

  constructor(database: DatabaseService, geminiService: GeminiRestService) {
    this.database = database;
    this.geminiService = geminiService;
  }

  // 賢いハイライト取得（キャッシュ優先）
  async getHighlights(period: string, targetDate: string, language: string = 'ja'): Promise<any[]> {
    try {
      // 1. キャッシュをチェック
      const cached = await this.database.getHighlightsCache(period, targetDate);
      const latestObservationId = await this.database.getLatestObservationId();

      // 2. キャッシュが有効かチェック（nullチェック追加）
      if (cached && latestObservationId !== null && cached.last_observation_id && cached.last_observation_id >= latestObservationId) {
        console.log(`🚀 Cache hit: ${period}/${targetDate} (fast)`);
        return cached.highlights_json || [];
      }

      // 3. キャッシュが古い or 存在しない → 新規生成
      console.log(`🔄 Cache miss: ${period}/${targetDate} (generating...)`);
      return await this.generateAndCacheHighlights(period, targetDate, language);

    } catch (error) {
      console.error('❌ Error getting highlights:', error);
      return [];
    }
  }

  // 実況停止時の一括ハイライト更新
  async updateAllHighlights(language: string = 'ja'): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      console.log('🌟 Updating all highlights after narration stop...');
      
      // 並列で全期間のハイライトを更新（言語パラメータ付き）
      await Promise.all([
        this.generateAndCacheHighlights('daily', today, language),
        this.generateAndCacheHighlights('weekly', today, language),
        this.generateAndCacheHighlights('monthly', today, language)
      ]);
      
      console.log('✅ All highlights updated successfully!');
    } catch (error) {
      console.error('❌ Error updating highlights:', error);
    }
  }

  // ハイライト生成＆キャッシュ保存
  private async generateAndCacheHighlights(period: string, targetDate: string, language: string = 'ja'): Promise<any[]> {
    try {
      // 1. 期間に応じてデータを取得
      const { observations, startDate, endDate } = await this.getObservationsForPeriod(period, targetDate);
      
      if (!observations || observations.length === 0) {
        return [];
      }

      // 2. aniccaにハイライト生成依頼（言語パラメータ付き）
      const highlights = await this.geminiService.generateHighlights(observations, period, startDate, endDate, language);
      
      // 3. 最新の観察IDを取得
      const latestObservationId = await this.database.getLatestObservationId();
      
      // 4. キャッシュに保存（新しいAPI形式）
      await this.database.saveHighlightsCache({
        period,
        target_date: targetDate,
        last_observation_id: latestObservationId || undefined,
        highlights_json: highlights
      });
      
      console.log(`💾 Generated and cached highlights: ${period}/${targetDate} (${highlights.length} items)`);
      return highlights;

    } catch (error) {
      console.error(`❌ Error generating highlights for ${period}/${targetDate}:`, error);
      return [];
    }
  }

  // 期間に応じた観察データ取得
  private async getObservationsForPeriod(period: string, targetDate: string) {
    let observations;
    let startDate, endDate;
    
    switch (period) {
      case 'daily':
        observations = await this.database.getObservationsByDate(targetDate);
        startDate = endDate = targetDate;
        break;
        
      case 'weekly':
        const weekStart = new Date(targetDate);
        weekStart.setDate(weekStart.getDate() - 6);
        startDate = weekStart.toISOString().split('T')[0];
        endDate = targetDate;
        observations = await this.database.getObservationsByDateRange(startDate, endDate);
        break;
        
      case 'monthly':
        const monthStart = new Date(targetDate);
        monthStart.setDate(monthStart.getDate() - 29);
        startDate = monthStart.toISOString().split('T')[0];
        endDate = targetDate;
        observations = await this.database.getObservationsByDateRange(startDate, endDate);
        break;
        
      default:
        throw new Error(`Invalid period: ${period}`);
    }
    
    return { observations, startDate, endDate };
  }
} 