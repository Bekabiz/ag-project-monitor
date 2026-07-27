-- Columns present in the live production database but absent from the repo
-- migrations. The repo had drifted behind production; production is truth.
--
-- doc_notes / doc_version / file_size are written by InputTab.jsx on every
-- document upload, so a project created without them fails uploads outright.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE entries  ADD COLUMN IF NOT EXISTS doc_notes TEXT;
ALTER TABLE entries  ADD COLUMN IF NOT EXISTS doc_version TEXT;
ALTER TABLE entries  ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- Backfill emails from auth.users so profiles matches production.
UPDATE profiles p SET email = u.email
FROM auth.users u WHERE u.id = p.id AND p.email IS NULL;
