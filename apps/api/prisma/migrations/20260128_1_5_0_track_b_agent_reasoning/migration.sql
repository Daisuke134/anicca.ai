-- Track B: Add agent_reasoning column to tiktok_posts
-- Stores the LLM agent's reasoning for each post decision
ALTER TABLE tiktok_posts ADD COLUMN IF NOT EXISTS agent_reasoning TEXT;
