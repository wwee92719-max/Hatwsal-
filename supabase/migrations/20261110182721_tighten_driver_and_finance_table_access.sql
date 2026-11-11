/*
# Data privacy: tighten table access, row policies and storage rules

1. Drivers
- Customers can no longer read the driver table directly. Approved drivers are listed through a function that returns only id, name and vehicle type.
- A signed-in driver can read only their own row. Admins can read all rows.
- Driver registration no longer writes this table from the browser.

2. Trips
- Customers can still create trips, with checks applied by the trip validation added earlier.
- A signed-in driver can read only their own trips. Admins can read all trips.
- Customers can no longer read other people's trips.

3. Wallet transactions and payment proofs
- Readable only by the owning driver and by admins.
- Payment proofs can be created only by the signed-in driver for themselves, always starting as pending.
- Payment proof amounts must be between 1 and 100000.

4. App settings (pricing and subscription price)
- Only admins can change settings. Everyone can still read them.

5. Storage
- Payment screenshots are uploaded only into the signed-in driver's own folder.
- Payment screenshots are readable only by admins.

6. Privileges
- Removed TRUNCATE, TRIGGER and REFERENCES privileges from anonymous and signed-in roles on all core tables.
- Removed the old policies that allowed everyone to read or change everything.
*/

DROP POLICY IF EXISTS drivers_insert_pending ON drivers;
DROP POLICY IF EXISTS drivers_select_all ON drivers;
REVOKE ALL ON drivers FROM anon, authenticated;
GRANT SELECT ON drivers TO authenticated;
DROP POLICY IF EXISTS drivers_select_own ON drivers;
CREATE POLICY drivers_select_own ON drivers FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS drivers_select_admin ON drivers;
CREATE POLICY drivers_select_admin ON drivers FOR SELECT TO authenticated USING (public.is_admin_user());

DROP POLICY IF EXISTS trips_select_all ON trips;
DROP POLICY IF EXISTS trips_insert_active_for_approved_driver ON trips;
REVOKE ALL ON trips FROM anon, authenticated;
GRANT SELECT ON trips TO authenticated;
GRANT INSERT (driver_id, client_name, client_phone, province, city, pickup, dropoff, distance_km, client_offer, final_fare) ON trips TO anon, authenticated;
DROP POLICY IF EXISTS trips_insert_customer ON trips;
CREATE POLICY trips_insert_customer ON trips FOR INSERT TO anon, authenticated WITH CHECK (status = 'active');
DROP POLICY IF EXISTS trips_select_own_driver ON trips;
CREATE POLICY trips_select_own_driver ON trips FOR SELECT TO authenticated USING (driver_id = public.current_driver_id());
DROP POLICY IF EXISTS trips_select_admin ON trips;
CREATE POLICY trips_select_admin ON trips FOR SELECT TO authenticated USING (public.is_admin_user());

DROP POLICY IF EXISTS wallet_transactions_select_all ON wallet_transactions;
REVOKE ALL ON wallet_transactions FROM anon, authenticated;
GRANT SELECT ON wallet_transactions TO authenticated;
DROP POLICY IF EXISTS wallet_transactions_select_own ON wallet_transactions;
CREATE POLICY wallet_transactions_select_own ON wallet_transactions FOR SELECT TO authenticated USING (driver_id = public.current_driver_id());
DROP POLICY IF EXISTS wallet_transactions_select_admin ON wallet_transactions;
CREATE POLICY wallet_transactions_select_admin ON wallet_transactions FOR SELECT TO authenticated USING (public.is_admin_user());

DROP POLICY IF EXISTS payment_proofs_select_all ON payment_proofs;
DROP POLICY IF EXISTS payment_proofs_insert_pending_for_approved_driver ON payment_proofs;
REVOKE ALL ON payment_proofs FROM anon, authenticated;
GRANT SELECT ON payment_proofs TO authenticated;
GRANT INSERT (driver_id, payment_account_id, amount, screenshot_path) ON payment_proofs TO authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_proofs_amount_range') THEN
    ALTER TABLE payment_proofs ADD CONSTRAINT payment_proofs_amount_range CHECK (amount > 0 AND amount <= 100000);
  END IF;
END $$;
DROP POLICY IF EXISTS payment_proofs_insert_own ON payment_proofs;
CREATE POLICY payment_proofs_insert_own ON payment_proofs FOR INSERT TO authenticated
  WITH CHECK (driver_id = public.current_driver_id() AND status = 'pending' AND reviewed_at IS NULL);
DROP POLICY IF EXISTS payment_proofs_select_own ON payment_proofs;
CREATE POLICY payment_proofs_select_own ON payment_proofs FOR SELECT TO authenticated USING (driver_id = public.current_driver_id());
DROP POLICY IF EXISTS payment_proofs_select_admin ON payment_proofs;
CREATE POLICY payment_proofs_select_admin ON payment_proofs FOR SELECT TO authenticated USING (public.is_admin_user());

REVOKE ALL ON admin_users FROM anon, authenticated;
REVOKE ALL ON payment_accounts FROM anon, authenticated;
GRANT SELECT ON payment_accounts TO anon, authenticated;
DROP POLICY IF EXISTS payment_accounts_select_all ON payment_accounts;
CREATE POLICY payment_accounts_select_all ON payment_accounts FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON app_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON app_settings TO anon, authenticated;
DROP POLICY IF EXISTS app_settings_insert_all ON app_settings;
DROP POLICY IF EXISTS app_settings_update_all ON app_settings;
DROP POLICY IF EXISTS app_settings_select_all ON app_settings;
CREATE POLICY app_settings_select_all ON app_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS app_settings_insert_admin ON app_settings;
CREATE POLICY app_settings_insert_admin ON app_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
DROP POLICY IF EXISTS app_settings_update_admin ON app_settings;
CREATE POLICY app_settings_update_admin ON app_settings FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS payment_proofs_storage_insert_own_folder ON storage.objects;
CREATE POLICY payment_proofs_storage_insert_own_folder ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = public.current_driver_id()::text);
DROP POLICY IF EXISTS payment_proofs_storage_select ON storage.objects;
CREATE POLICY payment_proofs_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.is_admin_user());
