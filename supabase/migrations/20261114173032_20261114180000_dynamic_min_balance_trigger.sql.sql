/*
# Make driver min balance threshold dynamic via app_settings

## Change
The trigger function `enforce_driver_min_balance()` previously had a hardcoded
threshold of 200 EGP. Now it reads the value from `app_settings` key
'required_min_balance' (default 300 if missing or invalid).

This lets admins change the required minimum wallet balance at any time
from the settings panel without touching code.
*/

CREATE OR REPLACE FUNCTION enforce_driver_min_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance numeric;
  v_threshold numeric;
  v_threshold_text text;
BEGIN
  -- Skip balance check for pending requests (no driver assigned yet)
  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Read dynamic threshold from app_settings (default 300)
  SELECT value INTO v_threshold_text
    FROM app_settings
    WHERE key = 'required_min_balance'
    LIMIT 1;

  v_threshold := CASE
    WHEN v_threshold_text IS NOT NULL AND v_threshold_text ~ '^[0-9]+(\.[0-9]+)?$'
      THEN v_threshold_text::numeric
    ELSE 300
  END;

  SELECT wallet_balance INTO v_balance FROM drivers WHERE id = NEW.driver_id;
  IF v_balance IS NULL OR v_balance < v_threshold THEN
    RAISE EXCEPTION 'driver_balance_too_low' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
