/*
# Admin read access to driver ID photos

Plain-English summary: the admin panel can now display the front and back of each captain's ID card. Only a signed-in admin (verified on the server with the existing admin check) can read these photos. Everyone else, including anonymous visitors using the app key, still cannot see them.

1. Security changes
- New SELECT policy on `storage.objects` named `driver_ids_storage_admin_select`.
- It applies only to the `driver-ids` bucket and only when `is_admin_user()` returns true for the caller.

2. Notes
- No existing policies, tables, or data are changed.
- Migration is idempotent: safe to re-run.
*/

DROP POLICY IF EXISTS "driver_ids_storage_admin_select" ON storage.objects;
CREATE POLICY "driver_ids_storage_admin_select" ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'driver-ids' AND is_admin_user());
