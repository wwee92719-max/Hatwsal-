/*
# Admin management: admin email list with add and revoke

1. New Tables
- `admin_users`
  - `id` (uuid, primary key)
  - `email` (text, required, stored lowercase; unique)
  - `is_main` (boolean) marks the main admin; the first admin added becomes main
  - `created_at` (timestamp)

2. Security
- Enable RLS on `admin_users` with no policies and no table grants, so the anon-key app cannot read or write the table directly.
- Access goes through three SECURITY DEFINER functions that validate input:
  - `admin_list_admins()` returns all admins.
  - `admin_add_admin(email)` adds an admin; rejects invalid or duplicate emails.
  - `admin_remove_admin(id)` revokes an admin; the main admin cannot be removed.
- EXECUTE is revoked from PUBLIC and granted to anon and authenticated, matching the other admin functions.

3. Important Notes
- The app currently has no sign-in, so these functions do not yet verify who is calling them. Revocation takes real effect only once admin sign-in is added.
- No admins are seeded. The first email added is marked as the main admin.
*/

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  is_main boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_lower_key ON admin_users (lower(email));

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION admin_list_admins()
RETURNS TABLE (id uuid, email text, is_main boolean, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.email, a.is_main, a.created_at
  FROM admin_users a
  ORDER BY a.is_main DESC, a.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION admin_add_admin(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF char_length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_admin_email';
  END IF;

  INSERT INTO admin_users (email, is_main)
  VALUES (v_email, NOT EXISTS (SELECT 1 FROM admin_users));
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'admin_exists';
END;
$$;

CREATE OR REPLACE FUNCTION admin_remove_admin(p_admin_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_main boolean;
BEGIN
  SELECT a.is_main INTO v_is_main FROM admin_users a WHERE a.id = p_admin_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_not_found';
  END IF;
  IF v_is_main THEN
    RAISE EXCEPTION 'cannot_remove_main_admin';
  END IF;

  DELETE FROM admin_users WHERE id = p_admin_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_list_admins() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_add_admin(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_remove_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_admins() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_add_admin(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_remove_admin(uuid) TO anon, authenticated;
