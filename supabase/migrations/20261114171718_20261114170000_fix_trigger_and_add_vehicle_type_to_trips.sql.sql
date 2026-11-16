/*
# Fix: trips INSERT fails for pending customer requests

## Root cause
The trigger `trips_driver_min_balance` calls `enforce_driver_min_balance()`
on every INSERT to `trips`. For pending customer requests, `driver_id` is NULL.
The function does `SELECT wallet_balance FROM drivers WHERE id = NEW.driver_id`
which returns NULL when driver_id is NULL, then raises `driver_balance_too_low`.

## Fix
1. Modify `enforce_driver_min_balance()` to skip the check when `NEW.driver_id IS NULL`
   (pending customer-created requests have no driver yet).
2. Add `vehicle_type` column to `trips` so the customer's vehicle selection is saved.
*/

CREATE OR REPLACE FUNCTION enforce_driver_min_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance numeric;
BEGIN
  -- Skip balance check for pending requests (no driver assigned yet)
  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT wallet_balance INTO v_balance FROM drivers WHERE id = NEW.driver_id;
  IF v_balance IS NULL OR v_balance < 200 THEN
    RAISE EXCEPTION 'driver_balance_too_low' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- Add vehicle_type column to trips
ALTER TABLE trips ADD COLUMN IF NOT EXISTS vehicle_type text;
