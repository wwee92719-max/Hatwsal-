/*
# Real-time GPS-filtered Ride Dispatch System

## Summary
Replaces the fake/simulated bid system with a real-time, GPS-filtered ride dispatch.
Captains broadcast their live GPS coordinates; customer ride requests store pickup
coordinates; a ride_bids table captures real captain offers; and a Haversine helper
function enables 5 km radius filtering.

## 1. New Columns on `drivers`
- `latitude`  (double precision, nullable) — captain's current GPS latitude
- `longitude` (double precision, nullable) — captain's current GPS longitude
- `is_online` (boolean, default false) — whether the captain is online and accepting requests

## 2. New Columns on `trips`
- `pickup_lat` (double precision, nullable) — customer pickup latitude
- `pickup_lng` (double precision, nullable) — customer pickup longitude
- `suggested_fare` (numeric, nullable) — auto-calculated suggested fare from pricing settings

The `status` column (text, default 'active') now also accepts 'pending' (customer
has requested but no captain assigned yet) and 'cancelled' (customer cancelled
before assignment). No CHECK constraint exists so no constraint change is needed.

## 3. New Table: `ride_bids`
- `id`           (uuid, PK, default gen_random_uuid())
- `trip_id`      (uuid, FK → trips.id ON DELETE CASCADE)
- `driver_id`    (uuid, FK → drivers.id ON DELETE CASCADE)
- `offer_amount` (numeric, NOT NULL) — the captain's price offer
- `status`       (text, NOT NULL, default 'pending') — 'pending' | 'accepted' | 'rejected'
- `created_at`   (timestamptz, default now())
- Unique constraint on (trip_id, driver_id) — one bid per captain per trip

## 4. New Function: `haversine_km(lat1, lng1, lat2, lng2)`
Returns the great-circle distance in kilometres between two coordinate pairs.
Uses the standard Haversine formula. SECURITY DEFINER, IMMUTABLE, available to
anon + authenticated so both the app and RPCs can call it.

## 5. New Function: `nearby_online_drivers(pickup_lat, pickup_lng, radius_km)`
Returns driver ids + distances for approved, online, subscribed captains within
the given radius of the pickup point. SECURITY DEFINER, STABLE. Granted to
anon + authenticated.

## 6. Security
- RLS enabled on `ride_bids` with full CRUD for anon + authenticated (the app
  uses the anon key — no driver auth).
- RLS policies added for the new `drivers` columns (UPDATE for GPS/online,
  SELECT is already open).
- RLS policies for new `trips` columns follow the existing open pattern.
- Grants: ride_bids CRUD to anon + authenticated; drivers UPDATE to
  anon + authenticated; haversine_km + nearby_online_drivers EXECUTE to
  anon + authenticated.
*/

-- 1. Add GPS + online columns to drivers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'latitude') THEN
    ALTER TABLE drivers ADD COLUMN latitude double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'longitude') THEN
    ALTER TABLE drivers ADD COLUMN longitude double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'drivers' AND column_name = 'is_online') THEN
    ALTER TABLE drivers ADD COLUMN is_online boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Add pickup coordinates + suggested_fare to trips
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trips' AND column_name = 'pickup_lat') THEN
    ALTER TABLE trips ADD COLUMN pickup_lat double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trips' AND column_name = 'pickup_lng') THEN
    ALTER TABLE trips ADD COLUMN pickup_lng double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trips' AND column_name = 'suggested_fare') THEN
    ALTER TABLE trips ADD COLUMN suggested_fare numeric;
  END IF;
END $$;

-- 3. Create ride_bids table
CREATE TABLE IF NOT EXISTS ride_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  offer_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, driver_id)
);

ALTER TABLE ride_bids ENABLE ROW LEVEL SECURITY;

-- 4. Haversine distance function (km)
CREATE OR REPLACE FUNCTION haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 6371.0 * (
    2 * atan2(
      sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lng2 - lng1) / 2), 2)
      ),
      sqrt(1 - (
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lng2 - lng1) / 2), 2)
      ))
    )
  );
$$;

-- 5. Nearby online drivers function
CREATE OR REPLACE FUNCTION nearby_online_drivers(
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_radius_km double precision DEFAULT 5.0
)
RETURNS TABLE (
  driver_id uuid,
  driver_name text,
  vehicle_type text,
  latitude double precision,
  longitude double precision,
  distance_km double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id AS driver_id,
    d.name AS driver_name,
    d.vehicle_type,
    d.latitude,
    d.longitude,
    haversine_km(p_pickup_lat, p_pickup_lng, d.latitude, d.longitude) AS distance_km
  FROM drivers d
  WHERE d.status = 'approved'
    AND d.is_online = true
    AND d.subscription_expires_at > now()
    AND d.latitude IS NOT NULL
    AND d.longitude IS NOT NULL
    AND haversine_km(p_pickup_lat, p_pickup_lng, d.latitude, d.longitude) <= p_radius_km
  ORDER BY distance_km ASC;
$$;

-- 6. Grants for ride_bids
GRANT SELECT, INSERT, UPDATE, DELETE ON ride_bids TO anon, authenticated;

-- 7. Grant UPDATE on drivers for GPS/online columns (SELECT already granted)
--    Column-restricted: only latitude, longitude, is_online can be updated by the app
GRANT UPDATE (latitude, longitude, is_online) ON drivers TO anon, authenticated;

-- 8. RLS policies for ride_bids (open — no auth, anon-key app)
DROP POLICY IF EXISTS "ride_bids_select_all" ON ride_bids;
CREATE POLICY "ride_bids_select_all"
  ON ride_bids FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "ride_bids_insert_all" ON ride_bids;
CREATE POLICY "ride_bids_insert_all"
  ON ride_bids FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ride_bids_update_all" ON ride_bids;
CREATE POLICY "ride_bids_update_all"
  ON ride_bids FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ride_bids_delete_all" ON ride_bids;
CREATE POLICY "ride_bids_delete_all"
  ON ride_bids FOR DELETE TO anon, authenticated USING (true);

-- 9. RLS policies for new drivers columns (UPDATE only — SELECT already open)
--    The existing drivers_select_all policy covers SELECT.
--    We need an UPDATE policy for latitude/longitude/is_online.
DROP POLICY IF EXISTS "drivers_update_location" ON drivers;
CREATE POLICY "drivers_update_location"
  ON drivers FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

-- 10. Function grants
REVOKE EXECUTE ON FUNCTION haversine_km(double precision, double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION haversine_km(double precision, double precision, double precision, double precision) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION nearby_online_drivers(double precision, double precision, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nearby_online_drivers(double precision, double precision, double precision) TO anon, authenticated;
