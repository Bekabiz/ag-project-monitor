-- AG Project Monitor: Row Level Security Policies
-- NOTE: Current app uses PIN-based auth (not Supabase Auth).
-- These policies use USING (true) as a placeholder.
-- When migrating to Supabase Auth, replace with auth.uid() checks.

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE general_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PERMISSIVE POLICIES (PIN auth phase)
-- Replace USING(true) with proper auth.uid() checks in production
-- ============================================

-- Projects
CREATE POLICY "read_projects" ON projects FOR SELECT USING (true);
CREATE POLICY "insert_projects" ON projects FOR INSERT WITH CHECK (true);
CREATE POLICY "update_projects" ON projects FOR UPDATE USING (true);

-- Profiles
CREATE POLICY "read_profiles" ON profiles FOR SELECT USING (true);

-- Project access
CREATE POLICY "read_project_access" ON project_access FOR SELECT USING (true);
CREATE POLICY "manage_project_access" ON project_access FOR ALL USING (true);

-- Entries
CREATE POLICY "read_entries" ON entries FOR SELECT USING (true);
CREATE POLICY "insert_entries" ON entries FOR INSERT WITH CHECK (true);
CREATE POLICY "update_entries" ON entries FOR UPDATE USING (true);
CREATE POLICY "delete_entries" ON entries FOR DELETE USING (true);

-- Steps (tasks)
CREATE POLICY "read_steps" ON steps FOR SELECT USING (true);
CREATE POLICY "insert_steps" ON steps FOR INSERT WITH CHECK (true);
CREATE POLICY "update_steps" ON steps FOR UPDATE USING (true);

-- Step notes
CREATE POLICY "read_step_notes" ON step_notes FOR SELECT USING (true);
CREATE POLICY "insert_step_notes" ON step_notes FOR INSERT WITH CHECK (true);

-- Announcements
CREATE POLICY "read_announcements" ON announcements FOR SELECT USING (true);
CREATE POLICY "insert_announcements" ON announcements FOR INSERT WITH CHECK (true);
CREATE POLICY "update_announcements" ON announcements FOR UPDATE USING (true);

-- General updates
CREATE POLICY "read_general_updates" ON general_updates FOR SELECT USING (true);
CREATE POLICY "insert_general_updates" ON general_updates FOR INSERT WITH CHECK (true);

-- Manager plans
CREATE POLICY "read_manager_plans" ON manager_plans FOR SELECT USING (true);
CREATE POLICY "insert_manager_plans" ON manager_plans FOR INSERT WITH CHECK (true);
CREATE POLICY "update_manager_plans" ON manager_plans FOR UPDATE USING (true);

-- Project areas
CREATE POLICY "read_project_areas" ON project_areas FOR SELECT USING (true);
CREATE POLICY "insert_project_areas" ON project_areas FOR INSERT WITH CHECK (true);

-- Deadlines
CREATE POLICY "read_deadlines" ON deadlines FOR SELECT USING (true);
CREATE POLICY "insert_deadlines" ON deadlines FOR INSERT WITH CHECK (true);
CREATE POLICY "update_deadlines" ON deadlines FOR UPDATE USING (true);

-- AI summaries
CREATE POLICY "read_ai_summaries" ON ai_summaries FOR SELECT USING (true);
CREATE POLICY "upsert_ai_summaries" ON ai_summaries FOR ALL USING (true);

-- ============================================
-- STORAGE
-- ============================================
-- Bucket: files (public, 50MB limit)
-- UPDATE storage.buckets SET file_size_limit = 52428800 WHERE name = 'files';
