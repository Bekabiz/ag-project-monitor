-- AG Project Monitor: Indexes and Views

-- ============================================
-- PERFORMANCE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_entries_project_created ON entries(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_steps_assigned ON steps(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_entries_tags ON entries USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_steps_project ON steps(project_id, status);
CREATE INDEX IF NOT EXISTS idx_step_notes_step ON step_notes(step_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deadlines_project ON deadlines(project_id, status);

-- ============================================
-- VIEWS
-- ============================================

CREATE OR REPLACE VIEW project_dashboard_stats AS
SELECT
  p.id,
  p.name,
  p.location,
  p.description,
  p.status,
  p.building_type,
  p.original_budget,
  p.current_budget,
  COUNT(DISTINCT e.id) FILTER (WHERE e.category = 'problem' AND e.entry_status = 'open') AS open_problems,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'overdue') AS overdue_deadlines,
  MAX(e.created_at) AS last_entry_at,
  MAX(e.created_at) FILTER (WHERE e.entry_type = 'photo') AS last_photo_at,
  COUNT(DISTINCT e.id) AS total_entries
FROM projects p
LEFT JOIN entries e ON e.project_id = p.id
LEFT JOIN deadlines d ON d.project_id = p.id
GROUP BY p.id;
