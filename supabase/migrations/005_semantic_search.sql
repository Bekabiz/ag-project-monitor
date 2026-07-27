-- AG Project Monitor: Semantic search (pgvector)
-- Was applied manually to the original project — versioned here so a fresh
-- project gets it too. Run after 001-004.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE entries ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE OR REPLACE FUNCTION match_entries(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_project_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  title text,
  category text,
  raw_text text,
  ai_summary text,
  tags text[],
  submitter_name text,
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.project_id, e.title, e.category,
    e.raw_text, e.ai_summary, e.tags, e.submitter_name,
    e.created_at,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM entries e
  WHERE 1 - (e.embedding <=> query_embedding) > match_threshold
    AND (filter_project_id IS NULL OR e.project_id = filter_project_id)
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE INDEX IF NOT EXISTS entries_embedding_idx
  ON entries USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
