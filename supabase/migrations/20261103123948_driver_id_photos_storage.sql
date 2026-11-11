/*
# Driver ID photo storage

Plain-English summary: captains registering in the app now upload the front and back of their ID card. The photos are stored in a private bucket that nobody can browse or download with the app's key, and the drivers table remembers where each photo lives.

1. New storage bucket
- `driver-ids`: private (not public), images only (JPEG, PNG, WEBP), 8 MB max per file.

2. Modified tables
- `drivers`: adds `id_front_path` (text, nullable) and `id_back_path` (text, nullable) that hold the storage path of each ID photo.

3. Security
- The bucket is NOT public, so no one can read an ID photo by URL.
- Storage policy on `storage.objects`: anon and authenticated roles may INSERT objects into `driver-ids` only. There is deliberately no SELECT policy, so the app cannot list or download ID photos.
- Existing drivers policies are unchanged.

4. Notes
- Admin review of ID photos is not built yet; a future admin-only read path will need its own policy.
- Migration is idempotent: safe to re-run.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('driver-ids', 'driver-ids', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS id_front_path text;
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS id_back_path text;

DROP POLICY IF EXISTS "driver_ids_storage_insert" ON storage.objects;
CREATE POLICY "driver_ids_storage_insert" ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'driver-ids');
