/*
# App settings table with Google Maps API key

Plain-English summary: adds a small settings table so the admin can paste the Google Maps key once, and the client page can read it to show the live map. Only the Maps key row is allowed to be written.

1. New tables
- `app_settings`: `key` (text, primary key), `value` (text, not null, default empty), `updated_at` (timestamptz).

2. Security
- RLS enabled on `app_settings`.
- Grants: SELECT, INSERT, UPDATE to `anon` and `authenticated` (the app has no sign-in, so the anon key is used). No DELETE.
- SELECT is open to both roles on purpose: the browser must read the Maps key to load the map. Google Maps keys are meant to be restricted by website domain in Google Cloud.
- INSERT and UPDATE are limited to the row with key `google_maps_api_key`, so these policies cannot be used to write other settings.

3. Notes
- Writes are not restricted to a signed-in admin because the admin panel has no server-side sign-in yet.
- Migration is idempotent: safe to re-run.
*/

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.app_settings TO anon, authenticated;

DROP POLICY IF EXISTS "app_settings_select_all" ON public.app_settings;
CREATE POLICY "app_settings_select_all" ON public.app_settings
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "app_settings_insert_maps_key" ON public.app_settings;
CREATE POLICY "app_settings_insert_maps_key" ON public.app_settings
FOR INSERT
TO anon, authenticated
WITH CHECK (key = 'google_maps_api_key');

DROP POLICY IF EXISTS "app_settings_update_maps_key" ON public.app_settings;
CREATE POLICY "app_settings_update_maps_key" ON public.app_settings
FOR UPDATE
TO anon, authenticated
USING (key = 'google_maps_api_key')
WITH CHECK (key = 'google_maps_api_key');
