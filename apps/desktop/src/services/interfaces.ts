// データベース関連のインターフェース定義

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
  saveUnderstanding(understanding: string): Promise<void>;
  getHighlightsCache(period: string, targetDate: string): Promise<any | null>;
  saveHighlightsCache(data: HighlightsCacheData): Promise<void>;
  getLatestObservationId(): Promise<number | null>;
  checkDailyLimit(limit: number): Promise<{ allowed: boolean; usage: number; remaining: number }>;
  incrementTodayUsage(): Promise<number>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  getUserProfile(): Promise<any>;
  saveUserProfile(profile: any): Promise<void>;
  close(): Promise<void>;
}