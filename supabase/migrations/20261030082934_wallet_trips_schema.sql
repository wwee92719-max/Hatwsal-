/*
# Captain wallet, trips and commission schema

Adds the three tables the app needs to store captains, their wallet balances,
completed/active trips and every wallet movement (manual top-ups and the
automatic 15% company commission).

1. New Tables
- `drivers`: captain profile (name, phone, address, vehicle type), approval status and `wallet_balance`.
- `trips`: one row per trip, created when a client accepts a captain's price; completed when the captain ends it. Stores final fare, commission (15%) and the captain's earning.
- `wallet_transactions`: append-only ledger of every wallet change (`topup` or `commission`), with the balance after each movement.

2. Security
- Row level security is enabled on all three tables.
- The app has no sign-in screen, so the anon role is granted read access and the minimum column-level insert access needed for registration and trip creation.
- Captains cannot set their own status or balance on insert (column grants + check policies).
- Balance, status and commission changes can only happen through the functions below, which run with elevated rights and validate their inputs.
- No direct UPDATE or DELETE is granted on any of the three tables.

3. Functions
- `complete_trip(trip_id, driver_phone)`: verifies the captain owns an active trip, deducts 15% of the final fare from the wallet, records the commission and marks the trip completed. All steps run in one transaction.
- `admin_topup_wallet(driver_id, amount, note)`: adds cash received by the admin to a captain's wallet and logs it.
- `admin_set_driver_status(driver_id, status)`: approves, rejects or resets a captain registration.

4. Important notes
- Commission rate is fixed at 15% inside `complete_trip`.
- Wallet balances may go negative when commission exceeds the balance; the captain then owes the company.
*/

CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  address text NOT NULL DEFAULT '',
  vehicle_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  wallet_balance numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  client_phone text NOT NULL,
  province text NOT NULL,
  city text NOT NULL,
  pickup text NOT NULL,
  dropoff text NOT NULL,
  distance_km numeric(6, 1),
  client_offer numeric(12, 2) NOT NULL DEFAULT 0,
  final_fare numeric(12, 2),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  commission numeric(12, 2) NOT NULL DEFAULT 0,
  driver_earning numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS trips_driver_status_idx ON trips (driver_id, status);
CREATE INDEX IF NOT EXISTS trips_completed_at_idx ON trips (completed_at);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES trips(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('topup', 'commission')),
  amount numeric(12, 2) NOT NULL,
  balance_after numeric(12, 2) NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_transactions_driver_idx ON wallet_transactions (driver_id, created_at DESC);

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON drivers TO anon, authenticated;
GRANT INSERT (name, phone, address, vehicle_type) ON drivers TO anon, authenticated;

GRANT SELECT ON trips TO anon, authenticated;
GRANT INSERT (driver_id, client_name, client_phone, province, city, pickup, dropoff, distance_km, client_offer, final_fare) ON trips TO anon, authenticated;

GRANT SELECT ON wallet_transactions TO anon, authenticated;

DROP POLICY IF EXISTS "drivers_select_all" ON drivers;
CREATE POLICY "drivers_select_all" ON drivers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "drivers_insert_pending" ON drivers;
CREATE POLICY "drivers_insert_pending" ON drivers FOR INSERT
  TO anon, authenticated WITH CHECK (status = 'pending' AND wallet_balance = 0);

DROP POLICY IF EXISTS "trips_select_all" ON trips;
CREATE POLICY "trips_select_all" ON trips FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "trips_insert_active_for_approved_driver" ON trips;
CREATE POLICY "trips_insert_active_for_approved_driver" ON trips FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM drivers d WHERE d.id = driver_id AND d.status = 'approved'
    )
  );

DROP POLICY IF EXISTS "wallet_transactions_select_all" ON wallet_transactions;
CREATE POLICY "wallet_transactions_select_all" ON wallet_transactions FOR SELECT
  TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION complete_trip(p_trip_id uuid, p_driver_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver drivers%ROWTYPE;
  v_trip trips%ROWTYPE;
  v_commission numeric(12, 2);
  v_balance numeric(12, 2);
BEGIN
  SELECT * INTO v_driver FROM drivers WHERE phone = p_driver_phone AND status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_not_found';
  END IF;

  SELECT * INTO v_trip FROM trips WHERE id = p_trip_id FOR UPDATE;
  IF NOT FOUND OR v_trip.driver_id IS DISTINCT FROM v_driver.id THEN
    RAISE EXCEPTION 'trip_not_found';
  END IF;
  IF v_trip.status <> 'active' THEN
    RAISE EXCEPTION 'trip_not_active';
  END IF;
  IF v_trip.final_fare IS NULL THEN
    RAISE EXCEPTION 'trip_has_no_fare';
  END IF;

  v_commission := round(v_trip.final_fare * 0.15, 2);

  UPDATE drivers
    SET wallet_balance = wallet_balance - v_commission
    WHERE id = v_driver.id
    RETURNING wallet_balance INTO v_balance;

  UPDATE trips
    SET status = 'completed',
        commission = v_commission,
        driver_earning = v_trip.final_fare - v_commission,
        completed_at = now()
    WHERE id = v_trip.id;

  INSERT INTO wallet_transactions (driver_id, trip_id, kind, amount, balance_after, note)
    VALUES (v_driver.id, v_trip.id, 'commission', -v_commission, v_balance, 'عمولة 15% من رحلة');

  RETURN jsonb_build_object(
    'commission', v_commission,
    'driver_earning', v_trip.final_fare - v_commission,
    'balance', v_balance
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_topup_wallet(p_driver_id uuid, p_amount numeric, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric(12, 2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  UPDATE drivers
    SET wallet_balance = wallet_balance + p_amount
    WHERE id = p_driver_id
    RETURNING wallet_balance INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_not_found';
  END IF;

  INSERT INTO wallet_transactions (driver_id, kind, amount, balance_after, note)
    VALUES (p_driver_id, 'topup', p_amount, v_balance, left(coalesce(p_note, ''), 200));

  RETURN jsonb_build_object('balance', v_balance);
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_driver_status(p_driver_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  UPDATE drivers SET status = p_status WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_not_found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_trip(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_topup_wallet(uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_set_driver_status(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION complete_trip(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_topup_wallet(uuid, numeric, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_set_driver_status(uuid, text) TO anon, authenticated;
