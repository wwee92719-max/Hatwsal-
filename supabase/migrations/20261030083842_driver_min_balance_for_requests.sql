/*
# Require a minimum wallet balance before a captain can receive trips

1. Behaviour
- A captain must have at least 200 EGP in `drivers.wallet_balance` before a trip can be created for them.
- Trips created for captains below the minimum are rejected by the database.

2. Changes
- New trigger function `enforce_driver_min_balance()` runs before each insert on `trips`.
- New trigger `trips_driver_min_balance` attaches that function to `trips`.

3. Security
- The trigger function is never callable through the API: EXECUTE is revoked from PUBLIC, anon and authenticated.
- No table grants or policies change.

4. Notes
- The rule is enforced in the database, so it cannot be bypassed from the app.
- Existing trips are not modified.
*/

CREATE OR REPLACE FUNCTION public.enforce_driver_min_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
BEGIN
  SELECT wallet_balance INTO v_balance FROM drivers WHERE id = NEW.driver_id;
  IF v_balance IS NULL OR v_balance < 200 THEN
    RAISE EXCEPTION 'driver_balance_too_low' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_driver_min_balance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trips_driver_min_balance ON trips;
CREATE TRIGGER trips_driver_min_balance
  BEFORE INSERT ON trips
  FOR EACH ROW EXECUTE FUNCTION public.enforce_driver_min_balance();
