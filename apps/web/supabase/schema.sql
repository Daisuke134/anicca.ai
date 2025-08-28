-- Supabase Schema for Anicca.ai
-- 
-- このファイルをSupabaseのSQL Editorで実行してください

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- 1. Users Profile Table
-- ========================================
-- Supabase Authと連携するユーザープロファイル
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  stripe_customer_id TEXT UNIQUE,
  subscription_status TEXT DEFAULT 'free', -- free, trial, active, canceled
  subscription_tier TEXT DEFAULT 'basic', -- basic, pro, enterprise
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- ========================================
-- 2. User Connections Table
-- ========================================
-- 各種サービスの接続情報を保存
CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service TEXT NOT NULL, -- slack, github, google-calendar等
  encrypted_tokens JSONB NOT NULL, -- 暗号化されたトークン情報
  session_id TEXT UNIQUE, -- 既存のセッションID（移行用）
  metadata JSONB, -- サービス固有の情報（team_id, workspace名等）
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id, service) -- 1ユーザー1サービス1接続
);

-- ========================================
-- 3. SDK Tasks Table
-- ========================================
-- Claude SDKのタスク実行履歴
CREATE TABLE IF NOT EXISTS public.sdk_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL, -- simple, complex, scheduled, autonomous
  status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  title TEXT NOT NULL,
  description TEXT,
  input_data JSONB, -- タスクの入力パラメータ
  output_data JSONB, -- タスクの実行結果
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- ========================================
-- 4. SDK Task Results Table
-- ========================================
-- タスクの成果物（ファイル、デプロイリンク等）
CREATE TABLE IF NOT EXISTS public.task_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.sdk_tasks(id) ON DELETE CASCADE,
  result_type TEXT NOT NULL, -- file, deployment, slack_message, github_pr
  title TEXT NOT NULL,
  description TEXT,
  url TEXT, -- ファイルURL、デプロイURL等
  metadata JSONB, -- 追加情報
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- ========================================
-- 5. User Settings Table
-- ========================================
-- ユーザー設定
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  language TEXT DEFAULT 'ja', -- ja, en
  timezone TEXT DEFAULT 'Asia/Tokyo',
  notifications_enabled BOOLEAN DEFAULT true,
  sdk_auto_execute BOOLEAN DEFAULT false, -- SDKの自動実行を許可
  max_monthly_sdk_tasks INTEGER DEFAULT 100, -- 月間SDK実行上限
  preferences JSONB DEFAULT '{}', -- その他の設定
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(user_id)
);

-- ========================================
-- 6. Usage Tracking Table
-- ========================================
-- 使用量追跡（課金用）
CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  usage_type TEXT NOT NULL, -- voice_minutes, sdk_tasks, api_calls
  quantity INTEGER NOT NULL DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- ========================================
-- Indexes
-- ========================================
CREATE INDEX idx_connections_user_id ON public.connections(user_id);
CREATE INDEX idx_connections_session_id ON public.connections(session_id);
CREATE INDEX idx_sdk_tasks_user_id ON public.sdk_tasks(user_id);
CREATE INDEX idx_sdk_tasks_status ON public.sdk_tasks(status);
CREATE INDEX idx_sdk_tasks_created_at ON public.sdk_tasks(created_at DESC);
CREATE INDEX idx_task_results_task_id ON public.task_results(task_id);
CREATE INDEX idx_usage_tracking_user_id_created_at ON public.usage_tracking(user_id, created_at DESC);

-- ========================================
-- Row Level Security (RLS)
-- ========================================
-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sdk_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Connections policies
CREATE POLICY "Users can view own connections" ON public.connections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections" ON public.connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections" ON public.connections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections" ON public.connections
  FOR DELETE USING (auth.uid() = user_id);

-- SDK Tasks policies
CREATE POLICY "Users can view own tasks" ON public.sdk_tasks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tasks" ON public.sdk_tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks" ON public.sdk_tasks
  FOR UPDATE USING (auth.uid() = user_id);

-- Task Results policies
CREATE POLICY "Users can view own task results" ON public.task_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sdk_tasks
      WHERE sdk_tasks.id = task_results.task_id
      AND sdk_tasks.user_id = auth.uid()
    )
  );

-- User Settings policies
CREATE POLICY "Users can view own settings" ON public.user_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON public.user_settings
  FOR ALL USING (auth.uid() = user_id);

-- Usage Tracking policies
CREATE POLICY "Users can view own usage" ON public.usage_tracking
  FOR SELECT USING (auth.uid() = user_id);

-- ========================================
-- Functions
-- ========================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  
  -- Create default settings
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_connections
  BEFORE UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_user_settings
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();