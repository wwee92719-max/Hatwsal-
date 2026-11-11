/*
# Driver accounts, secure driver functions, admin guards, trip validation

1. Changes
- `drivers.user_id` links each driver row to a Supabase sign-in account (email + password).
- `complete_trip` and `renew_driver_subscription` no longer accept a phone number. They identify the driver from the signed-in session.
- New `list_dispatchable_drivers()` and `customer_is_new(phone)` functions replace direct table reads by customers.
- Seven admin functions that did not check for an admin now require an admin session.
- New trip-insert validation: driver must be approved with an active subscription, fare must be within the minimum fare and 10000, text fields are length and format checked.
- The existing minimum-balance trip check runs with owner rights so it keeps working once customers lose direct table access.

2. Security
- Admin functions: `is_admin_user()` check added.
- `is_admin_user()` is no longer callable by anonymous visitors.

3. Notes
- Table access tightening happens in the following migration.
*/

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS drivers_user_id_key ON drivers (user_id) WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.current_driver_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.current_driver_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_driver_id() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_admin_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.complete_trip(uuid, text);
DROP FUNCTION IF EXISTS public.renew_driver_subscription(text);

CREATE OR REPLACE FUNCTION public.complete_trip(p_trip_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_driver drivers%ROWTYPE;
  v_trip trips%ROWTYPE;
  v_balance numeric(12, 2);
  v_first_trip_date timestamptz;
  v_is_new_customer boolean := false;
  v_original_fare numeric(12, 2);
  v_discount_amount numeric(12, 2) := 0;
BEGIN
  SELECT * INTO v_driver FROM drivers WHERE user_id = auth.uid() AND status = 'approved';
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
$function$;

REVOKE EXECUTE ON FUNCTION public.complete_trip(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_trip(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.renew_driver_subscription()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_driver drivers%ROWTYPE;
  v_price numeric(12, 2);
  v_balance numeric(12, 2);
  v_expires timestamptz;
BEGIN
  SELECT * INTO v_driver FROM drivers WHERE user_id = auth.uid() AND status = 'approved' FOR UPDATE;
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
$function$;

REVOKE EXECUTE ON FUNCTION public.renew_driver_subscription() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_driver_subscription() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_dispatchable_drivers()
RETURNS TABLE (id uuid, name text, vehicle_type text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.name, d.vehicle_type
  FROM public.drivers d
  WHERE d.status = 'approved' AND d.subscription_expires_at > now()
  ORDER BY d.created_at
$$;

REVOKE EXECUTE ON FUNCTION public.list_dispatchable_drivers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_dispatchable_drivers() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.customer_is_new(p_phone text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MIN(t.created_at) >= now() - interval '15 days', true)
  FROM public.trips t
  WHERE t.client_phone = p_phone
$$;

REVOKE EXECUTE ON FUNCTION public.customer_is_new(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_is_new(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_driver_status(p_driver_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  UPDATE drivers SET status = p_status WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_not_found';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_topup_wallet(p_driver_id uuid, p_amount numeric, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric(12, 2);
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_driver(p_driver_id uuid, p_name text, p_phone text, p_address text, p_vehicle_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF char_length(btrim(coalesce(p_name, ''))) < 1 OR char_length(btrim(coalesce(p_vehicle_type, ''))) < 1 THEN
    RAISE EXCEPTION 'invalid_driver_fields';
  END IF;
  IF btrim(coalesce(p_phone, '')) !~ '^[0-9+ ]{6,20}$' THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;

  UPDATE drivers
  SET name = btrim(p_name),
    phone = btrim(p_phone),
    address = btrim(coalesce(p_address, '')),
    vehicle_type = btrim(p_vehicle_type)
  WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_not_found';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_driver(p_driver_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM wallet_transactions WHERE driver_id = p_driver_id;
  DELETE FROM trips WHERE driver_id = p_driver_id;
  DELETE FROM drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_not_found';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_trip(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT status INTO v_status FROM trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trip_not_found';
  END IF;
  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'trip_completed';
  END IF;

  DELETE FROM trips WHERE id = p_trip_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_review_payment_proof(p_proof_id uuid, p_decision text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_proof payment_proofs%ROWTYPE;
  v_balance numeric(12, 2);
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  SELECT * INTO v_proof FROM payment_proofs WHERE id = p_proof_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proof_not_found';
  END IF;
  IF v_proof.status <> 'pending' THEN
    RAISE EXCEPTION 'proof_already_reviewed';
  END IF;

  IF p_decision = 'reject' THEN
    UPDATE payment_proofs SET status = 'rejected', reviewed_at = now() WHERE id = p_proof_id;
    RETURN jsonb_build_object('status', 'rejected');
  END IF;

  UPDATE drivers
  SET wallet_balance = wallet_balance + v_proof.amount
  WHERE id = v_proof.driver_id
  RETURNING wallet_balance INTO v_balance;

  INSERT INTO wallet_transactions (driver_id, kind, amount, balance_after, note)
  VALUES (v_proof.driver_id, 'topup', v_proof.amount, v_balance, 'تحويل معتمد من لقطة الشاشة');

  UPDATE payment_proofs SET status = 'approved', reviewed_at = now() WHERE id = p_proof_id;

  RETURN jsonb_build_object('status', 'approved', 'balance', v_balance);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_upsert_payment_account(p_id uuid, p_kind text, p_label text, p_account_number text, p_holder_name text, p_is_active boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_label text := btrim(coalesce(p_label, ''));
  v_number text := btrim(coalesce(p_account_number, ''));
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_kind NOT IN ('bank', 'etisalat_cash', 'vodafone_cash', 'other') THEN
    RAISE EXCEPTION 'invalid_account_kind';
  END IF;
  IF char_length(v_label) < 1 OR char_length(v_label) > 60 THEN
    RAISE EXCEPTION 'invalid_account_label';
  END IF;
  IF v_number !~ '^[A-Za-z0-9 -]{3,40}$' THEN
    RAISE EXCEPTION 'invalid_account_number';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO payment_accounts (kind, label, account_number, holder_name, is_active)
    VALUES (p_kind, v_label, v_number, left(coalesce(p_holder_name, ''), 80), coalesce(p_is_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE payment_accounts
    SET kind = p_kind,
      label = v_label,
      account_number = v_number,
      holder_name = left(coalesce(p_holder_name, ''), 80),
      is_active = coalesce(p_is_active, true)
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'payment_account_not_found';
    END IF;
  END IF;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_new_trip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_driver drivers%ROWTYPE;
  v_min_fare numeric;
BEGIN
  SELECT * INTO v_driver FROM drivers WHERE id = NEW.driver_id;
  IF NOT FOUND OR v_driver.status <> 'approved'
    OR v_driver.subscription_expires_at IS NULL OR v_driver.subscription_expires_at <= now() THEN
    RAISE EXCEPTION 'driver_not_available';
  END IF;

  SELECT value::numeric INTO v_min_fare FROM app_settings WHERE key = 'pricing_minimum_fare';
  IF NEW.final_fare IS NULL OR NEW.final_fare < COALESCE(v_min_fare, 0) OR NEW.final_fare > 10000 THEN
    RAISE EXCEPTION 'invalid_fare';
  END IF;
  IF NEW.client_offer IS NOT NULL AND (NEW.client_offer < 0 OR NEW.client_offer > 10000) THEN
    RAISE EXCEPTION 'invalid_offer';
  END IF;
  IF NEW.distance_km IS NOT NULL AND (NEW.distance_km < 0 OR NEW.distance_km > 1000) THEN
    RAISE EXCEPTION 'invalid_distance';
  END IF;

  NEW.client_name := btrim(coalesce(NEW.client_name, ''));
  IF char_length(NEW.client_name) < 1 OR char_length(NEW.client_name) > 80 THEN
    RAISE EXCEPTION 'invalid_client_name';
  END IF;
  IF coalesce(NEW.client_phone, '') !~ '^[0-9+ ]{6,20}$' THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;
  IF char_length(coalesce(NEW.pickup, '')) < 1 OR char_length(NEW.pickup) > 300
    OR char_length(coalesce(NEW.dropoff, '')) < 1 OR char_length(NEW.dropoff) > 300 THEN
    RAISE EXCEPTION 'invalid_location';
  END IF;
  IF char_length(coalesce(NEW.province, '')) > 80 OR char_length(coalesce(NEW.city, '')) > 80 THEN
    RAISE EXCEPTION 'invalid_location';
  END IF;

  NEW.status := 'active';
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_new_trip() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trips_validate_insert ON trips;
CREATE TRIGGER trips_validate_insert
BEFORE INSERT ON trips
FOR EACH ROW EXECUTE FUNCTION public.validate_new_trip();

ALTER FUNCTION public.enforce_driver_min_balance() SECURITY DEFINER;
REVOKE EXECUTE ON FUNCTION public.enforce_driver_min_balance() FROM PUBLIC, anon, authenticated;
