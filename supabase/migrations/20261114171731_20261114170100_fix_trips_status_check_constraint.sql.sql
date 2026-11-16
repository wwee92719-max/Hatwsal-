/*
# Fix: trips status check constraint blocks 'pending' and 'cancelled'

## Problem
The CHECK constraint `trips_status_check` only allows 'active' and 'completed'.
Pending customer requests use status='pending' and cancelled requests use 'cancelled',
both of which are rejected by this constraint — another root cause of the
"تعذر إرسال الطلب" error.
*/

ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_status_check;

ALTER TABLE trips ADD CONSTRAINT trips_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'completed'::text, 'cancelled'::text]));
