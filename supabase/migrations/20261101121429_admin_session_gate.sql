/*
# Server-side admin check based on the signed-in Google email

1. New Functions
- `is_admin_user()` returns true when the signed-in user's email (from their sign-in token) matches an email in `admin_users`, ignoring case. Anyone else, including anonymous visitors, gets false.

2. Modified Functions
- `admin_list_admins()`, `admin_add_admin(email)` and `admin_remove_admin(id)` now raise `not_authorized` unless `is_admin_user()` is true. Previously any visitor could call them.

3. Security
- `is_admin_user()` is granted to anon and authenticated so the app can ask whether the current session is an admin. It reveals only a true/false value for the caller.
- The `admin_users` table still has no direct grants and no policies, so it cannot be read or written directly.

4. Important Notes
- Admin sign-in uses Google through Supabase Auth. Revoking an admin removes their access on their next check.
- The first admin must be seeded in `admin_users` before anyone can sign in as an admin.
*/

CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admin_users a
    WHERE lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

CREATE OR REPLACE FUNCTION admin_list_admins()
RETURNS TABLE (id uuid, email text, is_main boolean, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

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
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

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
  IF NOT is_admin_user() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

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

REVOKE EXECUTE ON FUNCTION is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin_user() TO anon, authenticated;
