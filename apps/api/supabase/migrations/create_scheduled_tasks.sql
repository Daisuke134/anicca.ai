-- Create scheduled_tasks table for managing recurring tasks
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  instruction TEXT NOT NULL, -- Original user instruction
  frequency TEXT NOT NULL, -- daily, weekly, hourly, every_Xh
  time TEXT, -- HH:MM format for daily/weekly
  day_of_week TEXT, -- For weekly tasks (monday, tuesday, etc.)
  interval_hours INTEGER, -- For every_Xh tasks
  task_type TEXT NOT NULL, -- slack_check, email_check, post_message, etc.
  config JSONB DEFAULT '{}', -- Additional configuration
  next_run TIMESTAMP WITH TIME ZONE NOT NULL,
  last_run TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'active', -- active, paused, completed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient querying
CREATE INDEX idx_scheduled_tasks_next_run ON scheduled_tasks(next_run, status);
CREATE INDEX idx_scheduled_tasks_user_id ON scheduled_tasks(user_id);

-- Create task_execution_logs table for tracking execution history
CREATE TABLE IF NOT EXISTS task_execution_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL, -- running, completed, failed
  result JSONB, -- Execution result details
  error TEXT, -- Error message if failed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for logs
CREATE INDEX idx_task_execution_logs_task_id ON task_execution_logs(task_id);
CREATE INDEX idx_task_execution_logs_user_id ON task_execution_logs(user_id);

-- Add RLS policies
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_execution_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own scheduled tasks
CREATE POLICY "Users can view own scheduled tasks" ON scheduled_tasks
  FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own scheduled tasks" ON scheduled_tasks
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own scheduled tasks" ON scheduled_tasks
  FOR UPDATE USING (user_id = auth.uid()::text);

CREATE POLICY "Users can delete own scheduled tasks" ON scheduled_tasks
  FOR DELETE USING (user_id = auth.uid()::text);

-- Users can only see their own execution logs
CREATE POLICY "Users can view own execution logs" ON task_execution_logs
  FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own execution logs" ON task_execution_logs
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_scheduled_tasks_updated_at BEFORE UPDATE ON scheduled_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();