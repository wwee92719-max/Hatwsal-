INSERT INTO app_settings (key, value) VALUES ('subscription_price', '300')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check
  CHECK (kind IN ('topup', 'commission', 'discount_compensation', 'subscription'));

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

DROP FUNCTION IF EXISTS get_commission_rate(uuid);
