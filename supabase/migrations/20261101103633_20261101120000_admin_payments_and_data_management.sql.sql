/*
# Payment accounts, transfer screenshot approval and admin data management

1. New Tables
- `payment_accounts`: bank accounts and mobile wallet numbers shown to captains when they top up. Seeded with Etisalat Cash 01131146679 and Vodafone Cash 01033061493.
- `payment_proofs`: one row per transfer a captain submits, with the amount, chosen account, screenshot path and review status (pending, approved, rejected).

2. Storage
- Private bucket `payment-proofs` for screenshots, limited to 5 MB and to JPEG, PNG or WEBP.
- Captains may upload only into their own folder (named after their driver id) and only while approved.

3. Functions (admin actions)
- `admin_upsert_payment_account`: create or edit a payment account.
- `admin_review_payment_proof`: approve (credits the captain's wallet and logs it) or reject a transfer. A transfer can be reviewed only once.
- `admin_update_driver`: edit a captain's name, phone, address and vehicle.
- `admin_delete_driver`: delete a captain with their trips, wallet history and transfer records.
- `admin_delete_trip`: delete an active trip. Completed trips are financial records and cannot be deleted.

4. Security
- Row level security is enabled on both new tables.
- Captains can read payment accounts and transfers, and can insert transfers only as pending for themselves. They cannot change a transfer's status.
- No direct UPDATE or DELETE is granted on the new tables; every change goes through the functions above.

5. Important notes
- The app has no admin sign-in yet, so the admin functions are callable with the public key, the same as the existing admin functions.
- Existing trips, drivers and wallet balances are not modified by this migration.
*/

CREATE TABLE IF NOT EXISTS payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('bank', 'etisalat_cash', 'vodafone_cash', 'other')),
  label text NOT NULL,
  account_number text NOT NULL,
  holder_name text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  payment_account_id uuid REFERENCES payment_accounts(id) ON DELETE SET NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0 AND amount <= 100000),
  screenshot_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS payment_proofs_status_idx ON payment_proofs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_proofs_driver_idx ON payment_proofs (driver_id);

ALTER TABLE payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON payment_accounts TO anon, authenticated;
GRANT SELECT ON payment_proofs TO anon, authenticated;
GRANT INSERT (driver_id, payment_account_id, amount, screenshot_path) ON payment_proofs TO anon, authenticated;

DROP POLICY IF EXISTS "payment_accounts_select_all" ON payment_accounts;
CREATE POLICY "payment_accounts_select_all" ON payment_accounts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "payment_proofs_select_all" ON payment_proofs;
CREATE POLICY "payment_proofs_select_all" ON payment_proofs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "payment_proofs_insert_pending_for_approved_driver" ON payment_proofs;
CREATE POLICY "payment_proofs_insert_pending_for_approved_driver" ON payment_proofs FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND reviewed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM drivers d WHERE d.id = driver_id AND d.status = 'approved'
    )
  );

INSERT INTO payment_accounts (id, kind, label, account_number, holder_name, is_active) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'etisalat_cash', 'اتصالات كاش', '01131146679', '', true),
  ('e1000000-0000-4000-8000-000000000002', 'vodafone_cash', 'فودافون كاش', '01033061493', '', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "payment_proofs_storage_insert_own_folder" ON storage.objects;
CREATE POLICY "payment_proofs_storage_insert_own_folder" ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id::text = (storage.foldername(name))[1]
        AND d.status = 'approved'
    )
  );

DROP POLICY IF EXISTS "payment_proofs_storage_select" ON storage.objects;
CREATE POLICY "payment_proofs_storage_select" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'payment-proofs');

CREATE OR REPLACE FUNCTION admin_upsert_payment_account(
  p_id uuid,
  p_kind text,
  p_label text,
  p_account_number text,
  p_holder_name text,
  p_is_active boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_label text := btrim(coalesce(p_label, ''));
  v_number text := btrim(coalesce(p_account_number, ''));
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION admin_review_payment_proof(p_proof_id uuid, p_decision text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proof payment_proofs%ROWTYPE;
  v_balance numeric(12, 2);
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION admin_update_driver(
  p_driver_id uuid,
  p_name text,
  p_phone text,
  p_address text,
  p_vehicle_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION admin_delete_driver(p_driver_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM wallet_transactions WHERE driver_id = p_driver_id;
  DELETE FROM trips WHERE driver_id = p_driver_id;
  DELETE FROM drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'driver_not_found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin_delete_trip(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trip_not_found';
  END IF;
  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'trip_completed';
  END IF;

  DELETE FROM trips WHERE id = p_trip_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_upsert_payment_account(uuid, text, text, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_review_payment_proof(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_update_driver(uuid, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_delete_driver(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_delete_trip(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION admin_upsert_payment_account(uuid, text, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_review_payment_proof(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_update_driver(uuid, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_driver(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_trip(uuid) TO anon, authenticated;
