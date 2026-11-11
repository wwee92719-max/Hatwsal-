/*
# Admin email code sign-in, admin list seeding, and admin function lockdown

Plain-English summary: admins now sign in with a 6-digit code sent to their Gmail. Only the two approved admin emails can receive a code. Admin database actions require that signed-in session. The admin list is managed in the database instead of the browser.

1. Seeded admins
- `nqwdnaby@gmail.com` (main admin)
- `drmarwahussein95@gmail.com`
- Rows are inserted only if missing, so re-running is safe.

2. Admin list functions
- `admin_list_admins`, `admin_add_admin`, `admin_remove_admin` now reject callers that are not admins (`is_admin_user()`).
- Their signatures and return types are unchanged.

3. Security changes
- Every function whose name starts with `admin_` loses EXECUTE for `anon` and `PUBLIC`, and gains EXECUTE for `authenticated` only.
- Anonymous app visitors can no longer call admin actions such as wallet top-ups, driver status changes, or deletions.

4. Notes
- Only admins can obtain an authenticated session, because the code-request server function creates sign-in accounts only for emails in `admin_users`.
- Migration is idempotent: safe to re-run.
*/

INSERT INTO admin_users (email, is_main)
SELECT 'nqwdnaby@gmail.com', true
WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE lower(email) = 'nqwdnaby@gmail.com');

INSERT INTO admin_users (email, is_main)
SELECT 'drmarwahussein95@gmail.com', false
WHERE NOT EXISTS (SELECT 1 FROM admin_users WHERE lower(email) = 'drmarwahussein95@gmail.com');

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

  INSERT INTO admin_users (email, is_main) VALUES (v_email, false);
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

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'admin\_%'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;
