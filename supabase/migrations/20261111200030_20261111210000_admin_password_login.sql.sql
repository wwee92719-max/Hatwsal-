/*
# Admin password-based sign-in

## Summary
Replaces the 6-digit email OTP admin login with a direct email + password login.
Admins now have a password stored securely (pgcrypto `crypt`/`gen_salt`) in
`admin_users`, and a matching `auth.users` account is created with the same
email + password so that `supabase.auth.signInWithPassword()` works. A default
initial admin account is seeded so the owner can log in for the first time.

## 1. Schema changes
- `admin_users`: adds `password_hash text` column (nullable — existing admins
  get a password via the seed section or through the "Add Admin" form).
  When non-null, the admin can sign in with email + password.

## 2. New / changed functions
- `admin_add_admin_with_password(p_email text, p_password text)`:
  SECURITY DEFINER. Inserts a new row into `admin_users` with a `crypt()`-hashed
  password, then creates a matching `auth.users` account (email confirmed,
  same password) so the new admin can sign in with `signInWithPassword`.
  Requires the caller to already be an admin (`is_admin_user()`).
  Raises `admin_exists` on duplicate email, `invalid_admin_email` /
  `invalid_password` on bad input.
- `admin_list_admins()`: unchanged return shape, still admin-gated.
- `admin_verify_admin_password(p_email text, p_password text)`:
  SECURITY DEFINER. Returns boolean — true if the email exists in
  `admin_users` and the hash matches. Used by the edge function / server
  side only; the browser signs in via `auth.signInWithPassword` instead.

## 3. Security changes
- `pgcrypto` extension is already installed; we rely on `crypt()` + `gen_salt('bf')`.
- New functions are revoked from PUBLIC/anon and granted to `authenticated`.
- `admin_users` RLS stays enabled (no new policies needed — all access is via
  SECURITY DEFINER functions).
- Grants on `admin_users` are not broadened; the table stays locked to direct
  client access.

## 4. Default / initial admin
- The main admin `nqwdnaby@gmail.com` is given the default password
  `Admin@12345` (hashed with `gen_salt('bf')`) if it has no password yet.
- A matching `auth.users` row is created (email confirmed, same password) if
  one does not already exist, so `signInWithPassword` works on first login.
- The owner should change this password after first login.

## 5. Idempotency
- All statements are safe to re-run: `IF NOT EXISTS` for the column, conditional
  inserts for the seed, and `DROP POLICY IF EXISTS` is not needed (no new
  policies). Function definitions use `CREATE OR REPLACE`.
*/

-- 1. Add password_hash column if missing
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS password_hash text;

-- 2. admin_add_admin_with_password(p_email, p_password)
CREATE OR REPLACE FUNCTION admin_add_admin_with_password(p_email text, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_password text := coalesce(p_password, '');
  v_hash text;
  v_user_id uuid;
BEGIN
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF char_length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_admin_email';
  END IF;

  IF char_length(v_password) < 8 OR char_length(v_password) > 128 THEN
    RAISE EXCEPTION 'invalid_password';
  END IF;

  v_hash := crypt(v_password, gen_salt('bf'));

  INSERT INTO admin_users (email, is_main, password_hash)
  VALUES (v_email, false, v_hash);

  -- Create matching auth.users account with the same password
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data
  )
  SELECT
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    v_email,
    v_hash,
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email);

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'admin_exists';
END;
$$;

-- 3. admin_verify_admin_password(p_email, p_password)
CREATE OR REPLACE FUNCTION admin_verify_admin_password(p_email text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_stored text;
BEGIN
  SELECT a.password_hash INTO v_stored
  FROM admin_users a
  WHERE lower(a.email) = v_email;

  IF NOT FOUND OR v_stored IS NULL THEN
    RETURN false;
  END IF;

  RETURN v_stored = crypt(coalesce(p_password, ''), v_stored);
END;
$$;

-- 4. Revoke / grant execute on new functions
REVOKE EXECUTE ON FUNCTION admin_add_admin_with_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_add_admin_with_password(text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION admin_verify_admin_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_verify_admin_password(text, text) TO authenticated;

-- 5. Seed default password + auth.users for the main admin
DO $$
DECLARE
  v_email text := 'nqwdnaby@gmail.com';
  v_password text := 'Admin@12345';
  v_hash text;
BEGIN
  -- Set password_hash on the main admin row if it is null
  UPDATE admin_users
  SET password_hash = crypt(v_password, gen_salt('bf'))
  WHERE lower(email) = v_email AND password_hash IS NULL;

  -- Create auth.users entry for the main admin if missing
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data
  )
  SELECT
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    now(),
    now(),
    '{}'::jsonb,
    '{}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email);
END $$;
