/*
# Commission system, pricing settings, and new customer discount

1. Pricing Settings (app_settings seeds)
- Seeds 4 pricing keys: pricing_base_fare (15), pricing_per_km (3), pricing_per_minute (0.5), pricing_minimum_fare (20)
- Admin edits these from the settings page; the client page auto-calculates fare from them

2. Trip columns
- original_fare numeric(12,2): the full fare before new-customer 50% discount (NULL if no discount applied)
- discount_amount numeric(12,2) DEFAULT 0: the 50% discount amount compensating the captain
- commission_rate integer DEFAULT 10: the actual commission rate (10, 7, or 6) applied to this trip

3. Wallet transactions
- Adds 'discount_compensation' to the kind CHECK constraint alongside 'topup' and 'commission'

4. Commission tiers (get_commission_rate function)
- 10% base rate for all drivers
- 7% after 2 consecutive complete calendar months of 150+ completed trips each
- 6% after 3 consecutive complete calendar months of 150+ completed trips each
- Falls back to 10% if any recent month had fewer than 150 trips

5. New customer discount (in complete_trip)
- A customer whose first trip was created within the last 15 days is "new"
- New customers pay 50% of the agreed fare in cash
- Commission is calculated on the ORIGINAL fare (double the discounted amount)
- The 50% discount amount is added back to the captain's wallet as compensation
- Net captain earning is identical with or without discount

6. Updated app_settings policies
- Broadened INSERT/UPDATE to allow all keys (pricing + maps key), not just google_maps_api_key

7. Updated complete_trip
- Calls get_commission_rate for the tier-based rate
- Detects new customers, calculates original_fare and discount_amount
- Records two wallet_transactions when discount applies: commission (negative) + discount_compensation (positive)
- Returns commission_rate, original_fare, discount_amount alongside existing fields
*/

INSERT INTO app_settings (key, value) VALUES
  ('pricing_base_fare', '15'),
  ('pricing_per_km', '3'),
  ('pricing_per_minute', '0.5'),
  ('pricing_minimum_fare', '20')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE trips ADD COLUMN IF NOT EXISTS original_fare numeric(12, 2);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS discount_amount numeric(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS commission_rate integer NOT NULL DEFAULT 10;

ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_kind_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_kind_check
  CHECK (kind IN ('topup', 'commission', 'discount_compensation'));

DROP POLICY IF EXISTS "app_settings_insert_maps_key" ON app_settings;
DROP POLICY IF EXISTS "app_settings_update_maps_key" ON app_settings;

CREATE POLICY "app_settings_insert_all" ON app_settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE POLICY "app_settings_update_all" ON app_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION get_commission_rate(p_driver_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month1_count integer;
  v_month2_count integer;
  v_month3_count integer;
  v_now timestamptz := now();
  v_month_start timestamptz := date_trunc('month', v_now);
BEGIN
  SELECT count(*) INTO v_month1_count
  FROM trips
  WHERE driver_id = p_driver_id
    AND status = 'completed'
    AND completed_at >= v_month_start - interval '1 month'
    AND completed_at < v_month_start;

  SELECT count(*) INTO v_month2_count
  FROM trips
  WHERE driver_id = p_driver_id
    AND status = 'completed'
    AND completed_at >= v_month_start - interval '2 months'
    AND completed_at < v_month_start - interval '1 month';

  SELECT count(*) INTO v_month3_count
  FROM trips
  WHERE driver_id = p_driver_id
    AND status = 'completed'
    AND completed_at >= v_month_start - interval '3 months'
    AND completed_at < v_month_start - interval '2 months';

  IF v_month1_count >= 150 AND v_month2_count >= 150 AND v_month3_count >= 150 THEN
    RETURN 6;
  END IF;

  IF v_month1_count >= 150 AND v_month2_count >= 150 THEN
    RETURN 7;
  END IF;

  RETURN 10;
END;
$$;

CREATE OR REPLACE FUNCTION complete_trip(p_trip_id uuid, p_driver_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver drivers%ROWTYPE;
  v_trip trips%ROWTYPE;
  v_commission_rate integer;
  v_commission numeric(12, 2);
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

  v_commission_rate := get_commission_rate(v_driver.id);

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

  v_commission := round(v_original_fare * v_commission_rate / 100.0, 2);

  UPDATE drivers
    SET wallet_balance = wallet_balance - v_commission
    WHERE id = v_driver.id
    RETURNING wallet_balance INTO v_balance;

  INSERT INTO wallet_transactions (driver_id, trip_id, kind, amount, balance_after, note)
    VALUES (v_driver.id, v_trip.id, 'commission', -v_commission, v_balance,
            'عمولة ' || v_commission_rate || '% من رحلة');

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
        commission = v_commission,
        driver_earning = v_original_fare - v_commission,
        original_fare = v_original_fare,
        discount_amount = v_discount_amount,
        commission_rate = v_commission_rate,
        completed_at = now()
    WHERE id = v_trip.id;

  RETURN jsonb_build_object(
    'commission', v_commission,
    'driver_earning', v_original_fare - v_commission,
    'balance', v_balance,
    'commission_rate', v_commission_rate,
    'original_fare', v_original_fare,
    'discount_amount', v_discount_amount,
    'is_new_customer', v_is_new_customer
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_commission_rate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_commission_rate(uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION complete_trip(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_trip(uuid, text) TO anon, authenticated;
