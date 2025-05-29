-- anicca AGI Database Schema for Supabase
-- 実行方法: Supabase Dashboard > SQL Editor でこのファイルの内容を実行

-- observations テーブル
CREATE TABLE IF NOT EXISTS observations (
  id BIGSERIAL PRIMARY KEY,
  timestamp TEXT NOT NULL,
  date TEXT NOT NULL,
  hour INTEGER NOT NULL,
  commentary TEXT NOT NULL,
  website_name TEXT,
  action_category TEXT,
  prediction_data JSONB,
  verification_data JSONB,
  current_understanding TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- highlights_cache テーブル
CREATE TABLE IF NOT EXISTS highlights_cache (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  target_date TEXT NOT NULL,
  last_observation_id BIGINT,
  highlights_json JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(period, target_date)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_observations_date ON observations(date);
CREATE INDEX IF NOT EXISTS idx_observations_timestamp ON observations(timestamp);
CREATE INDEX IF NOT EXISTS idx_observations_hour ON observations(hour);
CREATE INDEX IF NOT EXISTS idx_highlights_cache_period_date ON highlights_cache(period, target_date);

-- RLS (Row Level Security) を無効化（サービスロールキーを使用するため）
ALTER TABLE observations DISABLE ROW LEVEL SECURITY;
ALTER TABLE highlights_cache DISABLE ROW LEVEL SECURITY;

-- 確認用クエリ
SELECT 'observations table created' as status;
SELECT 'highlights_cache table created' as status;
SELECT 'indexes created' as status;
SELECT 'RLS disabled' as status; 