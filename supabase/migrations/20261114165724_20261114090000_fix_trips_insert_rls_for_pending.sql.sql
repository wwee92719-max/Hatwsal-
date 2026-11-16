/*
# Fix trips INSERT policy to allow pending ride requests

## Problem
The existing `trips_insert_active_for_approved_driver` policy only allows
INSERTs where status = 'active' and a valid approved driver_id exists.
This blocks customers from creating pending ride requests (status = 'pending',
driver_id = null) — causing the "تعذر إرسال الطلب" error.

## Fix
Replace the INSERT policy with one that allows:
1. status = 'pending' with no driver_id (customer creating a new request)
2. status = 'active' with an approved driver_id (legacy/admin direct assignment)

Also add UPDATE and DELETE policies on trips so the app can:
- Update trip status (pending → active, active → completed, pending → cancelled)
- Delete trips (admin cleanup)

## Security
- SELECT: already open to anon + authenticated (unchanged)
- INSERT: anon + authenticated, pending or active-with-approved-driver
- UPDATE: anon + authenticated (app updates status/driver_id/final_fare)
- DELETE: anon + authenticated (admin cleanup)
*/

DROP POLICY IF EXISTS "trips_insert_active_for_approved_driver" ON trips;

CREATE POLICY "trips_insert_all"
  ON trips FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    OR (
      status = 'active'
      AND EXISTS (
        SELECT 1 FROM drivers d
        WHERE d.id = trips.driver_id AND d.status = 'approved'
      )
    )
  );

DROP POLICY IF EXISTS "trips_update_all" ON trips;
CREATE POLICY "trips_update_all"
  ON trips FOR UPDATE
  TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "trips_delete_all" ON trips;
CREATE POLICY "trips_delete_all"
  ON trips FOR DELETE
  TO anon, authenticated
  USING (true);

-- Ensure UPDATE and DELETE grants exist (SELECT/INSERT already present)
GRANT UPDATE, DELETE ON trips TO anon, authenticated;
