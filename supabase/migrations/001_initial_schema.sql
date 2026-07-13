-- AG Project Monitor: Complete Database Schema
-- Run this to recreate the database from scratch.
-- Generated from production Supabase (July 2026)

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  description TEXT,
  status TEXT DEFAULT 'active',
  building_type TEXT,
  original_budget NUMERIC DEFAULT 0,
  current_budget NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  full_name TEXT,
  role TEXT DEFAULT 'team', -- 'owner' or 'team'
  pin TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID,
  entry_type TEXT DEFAULT 'text', -- text, voice, photo, document, email
  raw_text TEXT,
  ai_summary TEXT,
  ai_extracted JSONB,
  title TEXT,
  category TEXT, -- work_update, problem, decision, material, client_request, note
  tags TEXT[],
  entry_status TEXT, -- open, resolved (for problems)
  submitter_name TEXT,
  file_url TEXT,
  file_name TEXT,
  is_team_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT entries_category_check CHECK (
    category IN ('work_update','problem','decision','material','client_request','note')
    OR category IS NULL
  )
);

CREATE TABLE IF NOT EXISTS steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID,
  assigned_to_name TEXT,
  created_by UUID,
  created_by_name TEXT,
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'not_started',
  position INTEGER DEFAULT 0,
  file_url TEXT,
  file_name TEXT,
  is_urgent BOOLEAN DEFAULT false,
  is_reviewed BOOLEAN DEFAULT false,
  review_result TEXT, -- approved, rejected
  registered_to_timeline BOOLEAN DEFAULT false,
  group_id UUID, -- links multi-assigned copies
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT steps_status_check CHECK (
    status IN ('not_started','in_progress','waiting','done')
  )
);

CREATE TABLE IF NOT EXISTS step_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID REFERENCES steps(id) ON DELETE CASCADE,
  user_id UUID,
  user_name TEXT,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS general_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_name TEXT,
  text TEXT,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_name TEXT,
  text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manager_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  plan_date DATE,
  text TEXT NOT NULL,
  is_done BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  area_type TEXT, -- room, system, exterior
  area_name TEXT,
  parent_area TEXT,
  sqm NUMERIC,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT,
  due_date DATE,
  status TEXT DEFAULT 'pending', -- pending, overdue, completed
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT UNIQUE, -- 'overall' or project_id
  summary_text TEXT,
  generated_at TIMESTAMPTZ DEFAULT now()
);
