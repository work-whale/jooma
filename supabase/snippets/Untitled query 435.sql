INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO UPDATE SET public = true;

SELECT id, name, public FROM storage.buckets;
