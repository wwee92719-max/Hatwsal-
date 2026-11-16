/*
# Fix crypt()/gen_salt() schema location

## Summary
pgcrypto is installed in the `extensions` schema on this Supabase project, not
`public`. The admin password functions referenced `public.crypt`/`public.gen_salt`,
which do not exist. This migration recreates them with `extensions.crypt` and
`extensions.gen_salt` so password hashing and verification work correctly.

## Changes
- `admin_add_admin_with_password`: uses `extensions.crypt()` + `extensions.gen_salt()`.
- `admin_verify_admin_password`: uses `extensions.crypt()`.
- No schema or security-policy changes.
*/

CREATE OR REPLACE FUNCTION admin_add_admin_with_password(p_email text, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_password text := coalesce(p_password, '');
  v_hash text;
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

  v_hash := extensions.crypt(v_password, extensions.gen_salt('bf'));

  INSERT INTO admin_users (email, is_main, password_hash)
  VALUES (v_email, false, v_hash);

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

CREATE OR REPLACE FUNCTION admin_verify_admin_password(p_email text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

  RETURN v_stored = extensions.crypt(coalesce(p_password, ''), v_stored);
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_add_admin_with_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_add_admin_with_password(text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION admin_verify_admin_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_verify_admin_password(text, text) TO authenticated;
