// Supabaseサポートは将来的に削除予定です
// 現在は後方互換性のためのみ保持されています
let createClient: any;
try {
  const supabase = require('@supabase/supabase-js');
  createClient = supabase.createClient;
} catch (e) {
  console.warn('⚠️ Supabase library not found. Supabase mode disabled.');
}

export interface ObservationData {
  timestamp: string;
  date: string;
  hour: number;
  commentary: string;
  websiteName: string;
  actionCategory: string;
  predictionData: string;
  verificationData: string;
  currentUnderstanding: string;
}

export interface HighlightsCacheData {
  period: string;
  target_date: string;
  last_observation_id?: number;
  highlights_json: any;
}

// 共通のデータベースインターフェース
export interface DatabaseInterface {
  init(): Promise<void>;
  saveObservation(data: ObservationData): Promise<void>;
  getObservationsByDate(date: string): Promise<any[]>;
  getRecentObservations(limit?: number): Promise<any[]>;
  getObservationCount(): Promise<number>;
  getObservationsByDateRange(startDate: string, endDate: string): Promise<any[]>;
  getLatestUnderstanding(): Promise<string | null>;
  getHighlightsCache(period: string, targetDate: string): Promise<any | null>;
  saveHighlightsCache(data: HighlightsCacheData): Promise<void>;
  getLatestObservationId(): Promise<number | null>;
  close(): Promise<void>;
}

export class DatabaseService implements DatabaseInterface {
  private supabase: any; // SupabaseClient型は動的ロードのためany使用

  constructor() {
    if (!createClient) {
      throw new Error('Supabase library not available. Please use SQLite mode (USE_SQLITE=true)');
    }
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    console.log('🔑 Supabase connected:', supabaseUrl);
  }

  async init(): Promise<void> {
    try {
      // テーブルの存在確認（簡単なクエリで確認）
      const { error: obsError } = await this.supabase
        .from('observations')
        .select('id')
        .limit(1);

      const { error: cacheError } = await this.supabase
        .from('highlights_cache')
        .select('id')
        .limit(1);

      if (obsError) {
        console.error('❌ Observations table not found:', obsError.message);
        throw new Error('Observations table not found. Please run the SQL schema first.');
      }

      if (cacheError) {
        console.error('❌ Highlights cache table not found:', cacheError.message);
        throw new Error('Highlights cache table not found. Please run the SQL schema first.');
      }

      console.log('✅ Observations table ready (Supabase)');
      console.log('✅ Highlights cache table ready (Supabase)');
      console.log('✅ Database indexes ready (Supabase)');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  async saveObservation(data: ObservationData): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('observations')
        .insert({
          timestamp: data.timestamp,
          date: data.date,
          hour: data.hour,
          commentary: data.commentary,
          website_name: data.websiteName,
          action_category: data.actionCategory,
          prediction_data: JSON.parse(data.predictionData),
          verification_data: JSON.parse(data.verificationData),
          current_understanding: data.currentUnderstanding
        });

      if (error) {
        throw error;
      }

      console.log('💾 Observation saved to Supabase');
    } catch (error) {
      console.error('❌ Error saving observation:', error);
      throw error;
    }
  }

  async getObservationsByDate(date: string): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('observations')
        .select('*')
        .eq('date', date)
        .order('timestamp', { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('❌ Error fetching observations by date:', error);
      throw error;
    }
  }

  async getRecentObservations(limit: number = 10): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('observations')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('❌ Error fetching recent observations:', error);
      throw error;
    }
  }

  async getObservationCount(): Promise<number> {
    try {
      const { count, error } = await this.supabase
        .from('observations')
        .select('*', { count: 'exact', head: true });

      if (error) {
        throw error;
      }

      return count || 0;
    } catch (error) {
      console.error('❌ Error getting observation count:', error);
      throw error;
    }
  }

  async getObservationsByDateRange(startDate: string, endDate: string): Promise<any[]> {
    try {
      const { data, error } = await this.supabase
        .from('observations')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('timestamp', { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('❌ Error fetching observations by date range:', error);
      throw error;
    }
  }

  async getLatestUnderstanding(): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('observations')
        .select('current_understanding')
        .order('timestamp', { ascending: false })
        .limit(1);

      if (error) {
        throw error;
      }

      return data && data.length > 0 ? data[0].current_understanding : null;
    } catch (error) {
      console.error('❌ Error fetching latest understanding:', error);
      return null;
    }
  }

  // ハイライトキャッシュ関連
  async getHighlightsCache(period: string, targetDate: string): Promise<any | null> {
    try {
      const { data, error } = await this.supabase
        .from('highlights_cache')
        .select('*')
        .eq('period', period)
        .eq('target_date', targetDate)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error;
      }

      return data;
    } catch (error) {
      console.error('❌ Error fetching highlights cache:', error);
      return null;
    }
  }

  async saveHighlightsCache(data: HighlightsCacheData): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('highlights_cache')
        .upsert({
          period: data.period,
          target_date: data.target_date,
          last_observation_id: data.last_observation_id,
          highlights_json: data.highlights_json,
          updated_at: new Date().toISOString()
        });

      if (error) {
        throw error;
      }

      console.log('💾 Highlights cache saved to Supabase');
    } catch (error) {
      console.error('❌ Error saving highlights cache:', error);
      throw error;
    }
  }

  async getLatestObservationId(): Promise<number | null> {
    try {
      const { data, error } = await this.supabase
        .from('observations')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);

      if (error) {
        throw error;
      }

      return data && data.length > 0 ? data[0].id : null;
    } catch (error) {
      console.error('❌ Error fetching latest observation ID:', error);
      return null;
    }
  }

  async close(): Promise<void> {
    // Supabaseクライアントは自動的にクリーンアップされるため、特別な処理は不要
    console.log('🔌 Supabase connection closed');
  }
} 