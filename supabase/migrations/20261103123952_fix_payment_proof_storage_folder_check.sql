/*
# Fix wallet receipt upload permission check

Plain-English summary: the rule that lets a captain upload a wallet receipt looked up the wrong value. It compared the driver's ID against the driver's name instead of the folder name on the uploaded file, so receipt uploads were rejected for every driver. This replaces that rule with the correct comparison. The rule still requires the driver to be approved.

1. Modified policy
- `payment_proofs_storage_insert_own_folder` on `storage.objects`: now checks that the upload folder (the first part of the file path, which is the driver's ID) matches an approved driver's ID.

2. Security
- Still restricted to the `payment-proofs` bucket.
- Still limited to approved drivers.
- Roles unchanged: anon and authenticated.

3. Notes
- Migration is idempotent: safe to re-run.
*/

DROP POLICY IF EXISTS "payment_proofs_storage_insert_own_folder" ON storage.objects;
CREATE POLICY "payment_proofs_storage_insert_own_folder" ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id::text = (storage.foldername(objects.name))[1]
      AND d.status = 'approved'
  )
);
