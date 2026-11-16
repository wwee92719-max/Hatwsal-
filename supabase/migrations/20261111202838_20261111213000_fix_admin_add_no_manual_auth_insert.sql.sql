/*
# Fix admin_add_admin_with_password — remove manual auth.users insert

## Summary
The `admin_add_admin_with_password` function previously inserted directly into
`auth.users`, which produced rows that GoTrue could not authenticate. This
migration removes that manual insert. Auth user creation is now handled by the
`admin-manage-auth` edge function, which uses GoTrue's admin API
(`auth.admin.createUser` / `auth.admin.updateUserById`) to create a proper
auth account. The RPC now only inserts the `admin_users` row with a hashed
password.

## Changes
- `admin_add_admin_with_password`: removed the `INSERT INTO auth.users` block.
  Now only inserts into `admin_users` with `extensions.crypt()` hashed password
  (cost 10 to match GoTrue).
- Uses `extensions.gen_salt('bf', 10)` instead of default cost 6.
- No security changes (same grants/revokes).
*/

CREATE OR REPLACE FUNCTION admin_add_admin_with_password(p_email text, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

  v_hash := extensions.crypt(v_password, extensions.gen_salt('bf', 10));

  INSERT INTO admin_users (email, is_main, password_hash)
  VALUES (v_email, false, v_hash);

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'admin_exists';
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_add_admin_with_password(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_add_admin_with_password(text, text) TO authenticated;
