-- Storage bucket for photos, documents and voice notes.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('files','files',true,52428800)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 52428800;

DROP POLICY IF EXISTS "public read files"   ON storage.objects;
DROP POLICY IF EXISTS "public insert files" ON storage.objects;
DROP POLICY IF EXISTS "public update files" ON storage.objects;
DROP POLICY IF EXISTS "public delete files" ON storage.objects;

CREATE POLICY "public read files"   ON storage.objects FOR SELECT USING (bucket_id = 'files');
CREATE POLICY "public insert files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'files');
CREATE POLICY "public update files" ON storage.objects FOR UPDATE USING (bucket_id = 'files');
CREATE POLICY "public delete files" ON storage.objects FOR DELETE USING (bucket_id = 'files');
