-- Columns that existed in production but were missing from 001.
-- Without these, a fresh project silently drops this data on import.

ALTER TABLE deadlines      ADD COLUMN IF NOT EXISTS entry_id UUID;
ALTER TABLE deadlines      ADD COLUMN IF NOT EXISTS alert_summary TEXT;
ALTER TABLE deadlines      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE announcements  ADD COLUMN IF NOT EXISTS voice_url TEXT;
ALTER TABLE manager_plans  ADD COLUMN IF NOT EXISTS converted_task_id UUID;
