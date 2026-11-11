/*
# Revert driver and trip security changes

1. Summary
- Removes the driver account linkage and the stricter driver, trip, wallet and payment access rules.
- Restores the original driver and trip functions and their table access.
- Keeps the admin-only guards on admin functions and the app settings write lockdown.

2. Changes
- Drops the trip validation trigger and its function.
- Drops list_dispatchable_drivers, customer_is_new and current_driver_id.
- Restores complete_trip(uuid, text) and renew_driver_subscription(text).
- Restores original policies on drivers, trips, wallet_transactions and payment_proofs.
- Restores original payment proof storage policies.
- Restores enforce_driver_min_balance as a normal invoker function.
- Drops drivers.user_id (all values were null).

3. Security
- Driver, trip and payment tables return to their previous open access.
- Admin function guards and app settings lockdown stay in place.

4. Notes
- Policies are dropped first so dependent objects can be removed.
*/

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('drivers', 'trips', 'wallet_transactions', 'payment_proofs')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trips_validate_insert ON trips;
DROP FUNCTION IF EXISTS validate_new_trip();

CREATE POLICY "drivers_select_all" ON drivers FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "drivers_insert_pending" ON drivers FOR INSERT
  TO anon, authenticated WITH CHECK (status = 'pending' AND wallet_balance = 0);

CREATE POLICY "trips_select_all" ON trips FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "trips_insert_active_for_approved_driver" ON trips FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM drivers d WHERE d.id = driver_id AND d.status = 'approved'
    )
  );

CREATE POLICY "wallet_transactions_select_all" ON wallet_transactions FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "payment_proofs_select_all" ON payment_proofs FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "payment_proofs_insert_pending_for_approved_driver" ON payment_proofs FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND reviewed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM drivers d WHERE d.id = driver_id AND d.status = 'approved'
    )
  );

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

DROP POLICY IF EXISTS "payment_proofs_storage_select" ON storage.objects;
CREATE POLICY "payment_proofs_storage_select" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'payment-proofs');

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON drivers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON trips TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON wallet_transactions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON payment_proofs TO anon, authenticated;

ALTER TABLE drivers DROP COLUMN IF EXISTS user_id;

DROP FUNCTION IF EXISTS list_dispatchable_drivers();
DROP FUNCTION IF EXISTS customer_is_new(text);
DROP FUNCTION IF EXISTS current_driver_id();
DROP FUNCTION IF EXISTS complete_trip(uuid);
DROP FUNCTION IF EXISTS renew_driver_subscription();

CREATE OR REPLACE FUNCTION renew_driver_subscription(p_driver_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver drivers%ROWTYPE;
  v_price numeric(12, 2);
  v_balance numeric(12, 2);
  v_expires timestamptz;
BEGIN
  SELECT * INTO v_driver FROM drivers WHERE phone = p_driver_phone AND status = 'approved' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_not_found';
  END IF;

  SELECT value::numeric INTO v_price FROM app_settings WHERE key = 'subscription_price';
  IF v_price IS NULL OR v_price <= 0 THEN
    RAISE EXCEPTION 'subscription_price_invalid';
  END IF;

  IF v_driver.wallet_balance < v_price THEN
    RAISE EXCEPTION 'insufficient_balance';
  END IF;

  v_expires := GREATEST(now(), COALESCE(v_driver.subscription_expires_at, now())) + interval '30 days';

  UPDATE drivers
    SET wallet_balance = wallet_balance - v_price,
        subscription_expires_at = v_expires
    WHERE id = v_driver.id
    RETURNING wallet_balance INTO v_balance;

  INSERT INTO wallet_transactions (driver_id, kind, amount, balance_after, note)
    VALUES (v_driver.id, 'subscription', -v_price, v_balance, 'اشتراك شهري لمدة 30 يوم');

  RETURN jsonb_build_object(
    'balance', v_balance,
    'expires_at', v_expires,
    'price', v_price
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION renew_driver_subscription(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION renew_driver_subscription(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION complete_trip(p_trip_id uuid, p_driver_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver drivers%ROWTYPE;
  v_trip trips%ROWTYPE;
  v_balance numeric(12, 2);
  v_first_trip_date timestamptz;
  v_is_new_customer boolean := false;
  v_original_fare numeric(12, 2);
  v_discount_amount numeric(12, 2) := 0;
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

  SELECT MIN(created_at) INTO v_first_trip_date
  FROM trips WHERE client_phone = v_trip.client_phone;

  IF v_first_trip_date IS NOT NULL AND v_first_trip_date >= now() - interval '15 days' THEN
    v_is_new_customer := true;
  END IF;

  IF v_is_new_customer THEN
    v_original_fare := v_trip.final_fare * 2;
    v_discount_amount := v_trip.final_fare;
  ELSE
    v_original_fare := v_trip.final_fare;
    v_discount_amount := 0;
  END IF;

  v_balance := v_driver.wallet_balance;

  IF v_discount_amount > 0 THEN
    UPDATE drivers
      SET wallet_balance = wallet_balance + v_discount_amount
      WHERE id = v_driver.id
      RETURNING wallet_balance INTO v_balance;

    INSERT INTO wallet_transactions (driver_id, trip_id, kind, amount, balance_after, note)
      VALUES (v_driver.id, v_trip.id, 'discount_compensation', v_discount_amount, v_balance,
              'تعويض خصم عميل جديد 50%');
  END IF;

  UPDATE trips
    SET status = 'completed',
        commission = 0,
        driver_earning = v_original_fare,
        original_fare = v_original_fare,
        discount_amount = v_discount_amount,
        commission_rate = 0,
        completed_at = now()
    WHERE id = v_trip.id;

  RETURN jsonb_build_object(
    'driver_earning', v_original_fare,
    'balance', v_balance,
    'original_fare', v_original_fare,
    'discount_amount', v_discount_amount,
    'is_new_customer', v_is_new_customer
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION complete_trip(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_trip(uuid, text) TO anon, authenticated;

ALTER FUNCTION enforce_driver_min_balance() SECURITY INVOKER;
