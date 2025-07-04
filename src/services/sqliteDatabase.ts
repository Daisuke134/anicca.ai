import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { DatabaseInterface, ObservationData, HighlightsCacheData } from './interfaces';

// SQLite結果の型定義
interface ObservationRow {
  id: number;
  timestamp: string;
  date: string;
  hour: number;
  commentary: string;
  website_name: string;
  action_category: string;
  prediction_data: string;
  verification_data: string;
  current_understanding: string;
  created_at: string;
}

interface CountResult {
  count: number;
}

interface SettingResult {
  value: string;
}

export class SQLiteDatabase implements DatabaseInterface {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor() {
    // ユーザーのホームディレクトリに .anicca フォルダを作成
    const aniccaDir = path.join(os.homedir(), '.anicca');
    if (!fs.existsSync(aniccaDir)) {
      fs.mkdirSync(aniccaDir, { recursive: true });
    }
    
    // データベースファイルのパス
    this.dbPath = path.join(aniccaDir, 'anicca_data.db');
    console.log('🗄️ SQLite database path:', this.dbPath);
  }

  async init(): Promise<void> {
    try {
      // SQLiteデータベースを開く
      this.db = new sqlite3.Database(this.dbPath);
      
      // テーブル作成
      await this.createTables();
      
      // インデックス作成
      await this.createIndexes();

      console.log('✅ SQLite database initialized');
      console.log('✅ Observations table ready (SQLite)');
      console.log('✅ Highlights cache table ready (SQLite)');
      console.log('✅ Database indexes ready (SQLite)');

    } catch (error) {
      console.error('❌ SQLite database initialization failed:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const dbRun = promisify(this.db.run.bind(this.db));

    // observations テーブル
    await dbRun(`
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        date TEXT NOT NULL,
        hour INTEGER NOT NULL,
        commentary TEXT NOT NULL,
        website_name TEXT,
        action_category TEXT,
        prediction_data TEXT,
        verification_data TEXT,
        current_understanding TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // highlights_cache テーブル
    await dbRun(`
      CREATE TABLE IF NOT EXISTS highlights_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period TEXT NOT NULL,
        target_date TEXT NOT NULL,
        last_observation_id INTEGER,
        highlights_json TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(period, target_date)
      )
    `);

    // settings テーブル (新規追加)
    await dbRun(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // daily_usage テーブル (API使用量制限管理)
    await dbRun(`
      CREATE TABLE IF NOT EXISTS daily_usage (
        date TEXT PRIMARY KEY,
        request_count INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // user_profiles テーブル (ユーザープロファイル)
    await dbRun(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_behavior TEXT,
        docs_behavior TEXT,
        youtube_limit TEXT,
        work_style TEXT,
        goals TEXT,
        gmail_address TEXT,
        gmail_password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 既存のテーブルに新しいカラムを追加（マイグレーション）
    try {
      await dbRun(`ALTER TABLE user_profiles ADD COLUMN gmail_address TEXT`);
      console.log('✅ Added gmail_address column to user_profiles');
    } catch (error) {
      // カラムが既に存在する場合はエラーを無視
    }
    
    try {
      await dbRun(`ALTER TABLE user_profiles ADD COLUMN gmail_password TEXT`);
      console.log('✅ Added gmail_password column to user_profiles');
    } catch (error) {
      // カラムが既に存在する場合はエラーを無視
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const dbRun = promisify(this.db.run.bind(this.db));

    // インデックス作成
    await dbRun('CREATE INDEX IF NOT EXISTS idx_observations_date ON observations(date)');
    await dbRun('CREATE INDEX IF NOT EXISTS idx_observations_timestamp ON observations(timestamp)');
    await dbRun('CREATE INDEX IF NOT EXISTS idx_observations_hour ON observations(hour)');
    await dbRun('CREATE INDEX IF NOT EXISTS idx_highlights_cache_period_date ON highlights_cache(period, target_date)');
  }

  async saveObservation(data: ObservationData): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const dbRun = promisify(this.db.run.bind(this.db)) as (sql: string, params: any[]) => Promise<sqlite3.RunResult>;
      
      await dbRun(`
        INSERT INTO observations (
          timestamp, date, hour, commentary, website_name, action_category,
          prediction_data, verification_data, current_understanding
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.timestamp,
        data.date,
        data.hour,
        data.commentary,
        data.websiteName,
        data.actionCategory,
        data.predictionData,
        data.verificationData,
        data.currentUnderstanding
      ]);

      console.log('💾 Observation saved to SQLite');
    } catch (error) {
      console.error('❌ Error saving observation:', error);
      throw error;
    }
  }

  async getObservationsByDate(date: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const dbAll = promisify(this.db.all.bind(this.db)) as (sql: string, params: any[]) => Promise<ObservationRow[]>;
      
      const rows = await dbAll(`
        SELECT * FROM observations 
        WHERE date = ? 
        ORDER BY timestamp ASC
      `, [date]);

      // JSONフィールドをパース
      return rows.map(row => ({
        ...row,
        prediction_data: row.prediction_data ? JSON.parse(row.prediction_data) : null,
        verification_data: row.verification_data ? JSON.parse(row.verification_data) : null
      }));
    } catch (error) {
      console.error('❌ Error fetching observations by date:', error);
      throw error;
    }
  }

  async getRecentObservations(limit: number = 10): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const dbAll = promisify(this.db.all.bind(this.db)) as (sql: string, params: any[]) => Promise<ObservationRow[]>;
      
      const rows = await dbAll(`
        SELECT * FROM observations 
        ORDER BY timestamp DESC 
        LIMIT ?
      `, [limit]);

      // JSONフィールドをパース
      return rows.map(row => ({
        ...row,
        prediction_data: row.prediction_data ? JSON.parse(row.prediction_data) : null,
        verification_data: row.verification_data ? JSON.parse(row.verification_data) : null
      }));
    } catch (error) {
      console.error('❌ Error fetching recent observations:', error);
      throw error;
    }
  }

  async getObservationCount(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const dbGet = promisify(this.db.get.bind(this.db)) as (sql: string) => Promise<CountResult>;
      
      const result = await dbGet('SELECT COUNT(*) as count FROM observations');
      return result.count || 0;
    } catch (error) {
      console.error('❌ Error getting observation count:', error);
      throw error;
    }
  }

  async getObservationsByDateRange(startDate: string, endDate: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const dbAll = promisify(this.db.all.bind(this.db)) as (sql: string, params: any[]) => Promise<ObservationRow[]>;
      
      const rows = await dbAll(`
        SELECT * FROM observations 
        WHERE date >= ? AND date <= ?
        ORDER BY timestamp ASC
      `, [startDate, endDate]);

      // JSONフィールドをパース
      return rows.map(row => ({
        ...row,
        prediction_data: row.prediction_data ? JSON.parse(row.prediction_data) : null,
        verification_data: row.verification_data ? JSON.parse(row.verification_data) : null
      }));
    } catch (error) {
      console.error('❌ Error fetching observations by date range:', error);
      throw error;
    }
  }

  async getLatestUnderstanding(): Promise<string | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const dbGet = promisify(this.db.get.bind(this.db)) as (sql: string) => Promise<ObservationRow | undefined>;
      
      const result = await dbGet(`
        SELECT current_understanding FROM observations 
        ORDER BY timestamp DESC 
        LIMIT 1
      `);

      return result?.current_understanding || null;
    } catch (error) {
      console.error('❌ Error fetching latest understanding:', error);
      return null;
    }
  }

  async saveUnderstanding(understanding: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      // 理解度をsettingsテーブルに保存（履歴を保持）
      const dbRun = promisify(this.db.run.bind(this.db)) as (sql: string, params: any[]) => Promise<sqlite3.RunResult>;
      
      await dbRun(`
        INSERT OR REPLACE INTO settings (key, value, updated_at) 
        VALUES ('latest_understanding', ?, CURRENT_TIMESTAMP)
      `, [understanding]);

      console.log('🧠 Understanding saved to database');
    } catch (error) {
      console.error('❌ Error saving understanding:', error);
      throw error;
    }
  }

  // ハイライトキャッシュ関連
  async getHighlightsCache(period: string, targetDate: string): Promise<any | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const dbGet = promisify(this.db.get.bind(this.db)) as (sql: string, params: any[]) => Promise<any>;
      
      const result = await dbGet(`
        SELECT * FROM highlights_cache 
        WHERE period = ? AND target_date = ?
      `, [period, targetDate]);

      if (result) {
        return {
          ...result,
          highlights_json: result.highlights_json ? JSON.parse(result.highlights_json) : null
        };
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error fetching highlights cache:', error);
      return null;
    }
  }

  async saveHighlightsCache(data: HighlightsCacheData): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const dbRun = promisify(this.db.run.bind(this.db)) as (sql: string, params: any[]) => Promise<sqlite3.RunResult>;
      
      await dbRun(`
        INSERT OR REPLACE INTO highlights_cache (
          period, target_date, last_observation_id, highlights_json, updated_at
        ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        data.period,
        data.target_date,
        data.last_observation_id,
        JSON.stringify(data.highlights_json)
      ]);

      console.log('💾 Highlights cache saved to SQLite');
    } catch (error) {
      console.error('❌ Error saving highlights cache:', error);
      throw error;
    }
  }

  async getLatestObservationId(): Promise<number | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const dbGet = promisify(this.db.get.bind(this.db)) as (sql: string) => Promise<{ id: number } | undefined>;
      
      const result = await dbGet(`
        SELECT id FROM observations 
        ORDER BY id DESC 
        LIMIT 1
      `);

      return result?.id || null;
    } catch (error) {
      console.error('❌ Error fetching latest observation ID:', error);
      return null;
    }
  }

  // Settings関連 (新機能)
  async getSetting(key: string): Promise<string | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const dbGet = promisify(this.db.get.bind(this.db)) as (sql: string, params: any[]) => Promise<SettingResult | undefined>;
      
      const result = await dbGet(`
        SELECT value FROM settings WHERE key = ?
      `, [key]);

      return result?.value || null;
    } catch (error) {
      console.error('❌ Error getting setting:', error);
      return null;
    }
  }

  async setSetting(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const dbRun = promisify(this.db.run.bind(this.db)) as (sql: string, params: any[]) => Promise<sqlite3.RunResult>;
      
      await dbRun(`
        INSERT OR REPLACE INTO settings (key, value, updated_at) 
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `, [key, value]);

      console.log(`💾 Setting saved: ${key} = ${value}`);
    } catch (error) {
      console.error('❌ Error saving setting:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      const dbClose = promisify(this.db.close.bind(this.db));
      await dbClose();
      this.db = null;
      console.log('🔌 SQLite connection closed');
    }
  }

  // 使用量制限管理メソッド
  async getTodayUsage(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const dbGet = promisify(this.db.get.bind(this.db)) as (sql: string, params: any[]) => Promise<{ request_count: number } | undefined>;
      
      const result = await dbGet(`
        SELECT request_count FROM daily_usage WHERE date = ?
      `, [today]);

      return result?.request_count || 0;
    } catch (error) {
      console.error('❌ Error getting today usage:', error);
      return 0;
    }
  }

  async incrementTodayUsage(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const dbRun = promisify(this.db.run.bind(this.db)) as (sql: string, params: any[]) => Promise<sqlite3.RunResult>;
      
      await dbRun(`
        INSERT OR REPLACE INTO daily_usage (date, request_count, updated_at) 
        VALUES (?, COALESCE((SELECT request_count FROM daily_usage WHERE date = ?), 0) + 1, CURRENT_TIMESTAMP)
      `, [today, today]);

      // 更新後の使用回数を取得
      return await this.getTodayUsage();
    } catch (error) {
      console.error('❌ Error incrementing today usage:', error);
      return 0;
    }
  }

  async checkDailyLimit(limit: number = 100): Promise<{ allowed: boolean; usage: number; remaining: number }> {
    const usage = await this.getTodayUsage();
    const remaining = Math.max(0, limit - usage);
    const allowed = usage < limit;

    return { allowed, usage, remaining };
  }

  // User Profile methods
  async getUserProfile(): Promise<any | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const dbGet = promisify(this.db.get.bind(this.db)) as (sql: string) => Promise<any | undefined>;
      
      const profile = await dbGet(`
        SELECT * FROM user_profiles 
        ORDER BY id DESC 
        LIMIT 1
      `);

      if (profile && profile.gmail_password) {
        // パスワードをデコード（Base64デコード）
        try {
          profile.gmail_password = Buffer.from(profile.gmail_password, 'base64').toString();
        } catch (error) {
          console.error('❌ Error decoding password:', error);
          profile.gmail_password = '';
        }
      }

      return profile || null;
    } catch (error) {
      console.error('❌ Error getting user profile:', error);
      return null;
    }
  }

  async saveUserProfile(profile: {
    emailBehavior: string;
    docsBehavior: string;
    youtubeLimit: string;
    workStyle: string;
    goals: string;
    gmailAddress: string;
    gmailPassword: string;
  }): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const dbRun = promisify(this.db.run.bind(this.db)) as (sql: string, params: any[]) => Promise<sqlite3.RunResult>;
      
      // 既存のプロファイルがあるか確認
      const existing = await this.getUserProfile();
      
      if (existing) {
        // 更新
        await dbRun(`
          UPDATE user_profiles 
          SET email_behavior = ?, docs_behavior = ?, youtube_limit = ?, 
              work_style = ?, goals = ?, gmail_address = ?, gmail_password = ?, 
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [
          profile.emailBehavior,
          profile.docsBehavior,
          profile.youtubeLimit,
          profile.workStyle,
          profile.goals,
          profile.gmailAddress,
          // パスワードを簡単に暗号化（Base64エンコード）
          profile.gmailPassword ? Buffer.from(profile.gmailPassword).toString('base64') : '',
          existing.id
        ]);
        console.log('✅ User profile updated');
      } else {
        // 新規作成
        await dbRun(`
          INSERT INTO user_profiles (
            email_behavior, docs_behavior, youtube_limit, work_style, goals, 
            gmail_address, gmail_password
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          profile.emailBehavior,
          profile.docsBehavior,
          profile.youtubeLimit,
          profile.workStyle,
          profile.goals,
          profile.gmailAddress,
          // パスワードを簡単に暗号化（Base64エンコード）
          profile.gmailPassword ? Buffer.from(profile.gmailPassword).toString('base64') : ''
        ]);
        console.log('✅ User profile created');
      }
    } catch (error) {
      console.error('❌ Error saving user profile:', error);
      throw error;
    }
  }
} 