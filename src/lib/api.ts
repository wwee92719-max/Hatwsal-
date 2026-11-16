import { supabase } from '@/lib/supabase';

export type DriverStatus = 'pending' | 'approved' | 'rejected';

export type WalletTransactionKind = 'topup' | 'subscription' | 'commission' | 'discount_compensation';

export type Driver = {
  id: string;
  name: string;
  phone: string;
  address: string;
  vehicleType: string;
  status: DriverStatus;
  walletBalance: number;
  createdAt: string;
  idFrontPath: string | null;
  idBackPath: string | null;
  subscriptionExpiresAt: string | null;
  latitude: number | null;
  longitude: number | null;
  isOnline: boolean;
};

export type WalletTransaction = {
  id: string;
  driverId: string;
  driverName: string;
  kind: WalletTransactionKind;
  amount: number;
  balanceAfter: number;
  note: string;
  createdAt: string;
};

export type Trip = {
  id: string;
  driverId: string;
  clientName: string;
  clientPhone: string;
  province: string;
  city: string;
  pickup: string;
  dropoff: string;
  finalFare: number | null;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  createdAt: string;
  pickupLat: number | null;
  pickupLng: number | null;
  suggestedFare: number | null;
  distanceKm: number | null;
  clientOffer: number;
  vehicleType: string | null;
};

export type CompletedTripSummary = {
  driverId: string;
  driverEarning: number;
};

export type CompleteTripResult = {
  driverEarning: number;
  balance: number;
  originalFare: number;
  discountAmount: number;
  isNewCustomer: boolean;
};

type DriverRow = {
  id: string;
  name: string;
  phone: string;
  address: string;
  vehicle_type: string;
  status: DriverStatus;
  wallet_balance: number | string;
  created_at: string;
  id_front_path: string | null;
  id_back_path: string | null;
  subscription_expires_at: string | null;
  latitude: number | null;
  longitude: number | null;
  is_online: boolean;
};

type WalletTransactionRow = {
  id: string;
  driver_id: string;
  kind: WalletTransactionKind;
  amount: number | string;
  balance_after: number | string;
  note: string;
  created_at: string;
  drivers: { name: string } | null;
};

type TripRow = {
  id: string;
  driver_id: string;
  client_name: string;
  client_phone: string;
  province: string;
  city: string;
  pickup: string;
  dropoff: string;
  final_fare: number | string | null;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  suggested_fare: number | string | null;
  distance_km: number | string | null;
  client_offer: number | string;
  vehicle_type: string | null;
};

const DRIVER_COLUMNS = 'id, name, phone, address, vehicle_type, status, wallet_balance, created_at, id_front_path, id_back_path, subscription_expires_at, latitude, longitude, is_online';
const TRIP_COLUMNS = 'id, driver_id, client_name, client_phone, province, city, pickup, dropoff, final_fare, status, created_at, pickup_lat, pickup_lng, suggested_fare, distance_km, client_offer, vehicle_type';

export const toNumber = (value: number | string | null) => (value === null ? 0 : Number(value));

const toDriver = (row: DriverRow): Driver => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  address: row.address,
  vehicleType: row.vehicle_type,
  status: row.status,
  walletBalance: toNumber(row.wallet_balance),
  createdAt: row.created_at,
  idFrontPath: row.id_front_path ?? null,
  idBackPath: row.id_back_path ?? null,
  subscriptionExpiresAt: row.subscription_expires_at,
  latitude: row.latitude ?? null,
  longitude: row.longitude ?? null,
  isOnline: row.is_online ?? false,
});

export function hasActiveSubscription(driver: Pick<Driver, 'subscriptionExpiresAt'>): boolean {
  return driver.subscriptionExpiresAt !== null && new Date(driver.subscriptionExpiresAt).getTime() > Date.now();
}

const toTrip = (row: TripRow): Trip => ({
  id: row.id,
  driverId: row.driver_id,
  clientName: row.client_name,
  clientPhone: row.client_phone,
  province: row.province,
  city: row.city,
  pickup: row.pickup,
  dropoff: row.dropoff,
  finalFare: row.final_fare === null ? null : Number(row.final_fare),
  status: row.status,
  createdAt: row.created_at,
  pickupLat: row.pickup_lat ?? null,
  pickupLng: row.pickup_lng ?? null,
  suggestedFare: row.suggested_fare === null ? null : Number(row.suggested_fare),
  distanceKm: row.distance_km === null ? null : Number(row.distance_km),
  clientOffer: toNumber(row.client_offer),
  vehicleType: row.vehicle_type ?? null,
});

const toWalletTransaction = (row: WalletTransactionRow): WalletTransaction => ({
  id: row.id,
  driverId: row.driver_id,
  driverName: row.drivers?.name ?? '-',
  kind: row.kind,
  amount: toNumber(row.amount),
  balanceAfter: toNumber(row.balance_after),
  note: row.note,
  createdAt: row.created_at,
});

export async function listDrivers(): Promise<Driver[]> {
  const { data, error } = await supabase
    .from('drivers')
    .select(DRIVER_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as DriverRow[]).map(toDriver);
}

export async function listDispatchableDrivers(): Promise<Driver[]> {
  const { data, error } = await supabase
    .from('drivers')
    .select(DRIVER_COLUMNS)
    .eq('status', 'approved')
    .gt('subscription_expires_at', new Date().toISOString())
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as DriverRow[]).map(toDriver);
}

export async function findDriverByPhone(phone: string): Promise<Driver | null> {
  const { data, error } = await supabase
    .from('drivers')
    .select(DRIVER_COLUMNS)
    .eq('phone', phone)
    .maybeSingle();
  if (error) throw error;
  return data ? toDriver(data as DriverRow) : null;
}

const DRIVER_ID_BUCKET = 'driver-ids';

export async function registerDriver(input: {
  name: string;
  phone: string;
  address: string;
  vehicleType: string;
  idFront: File;
  idBack: File;
}): Promise<void> {
  const folder = crypto.randomUUID();
  const frontPath = `${folder}/front.jpg`;
  const backPath = `${folder}/back.jpg`;
  const storage = supabase.storage.from(DRIVER_ID_BUCKET);

  const { error: frontError } = await storage.upload(frontPath, input.idFront, { contentType: 'image/jpeg', upsert: false });
  if (frontError) throw frontError;
  const { error: backError } = await storage.upload(backPath, input.idBack, { contentType: 'image/jpeg', upsert: false });
  if (backError) {
    await storage.remove([frontPath]);
    throw backError;
  }

  const { error } = await supabase.from('drivers').insert({
    name: input.name,
    phone: input.phone,
    address: input.address,
    vehicle_type: input.vehicleType,
    id_front_path: frontPath,
    id_back_path: backPath,
  });
  if (error) {
    await storage.remove([frontPath, backPath]);
    if (error.code === '23505') throw new Error('phone_taken');
    throw error;
  }
}

export async function renewDriverSubscription(driverPhone: string): Promise<{ balance: number; expiresAt: string }> {
  const { data, error } = await supabase.rpc('renew_driver_subscription', { p_driver_phone: driverPhone });
  if (error) throw error;
  const result = data as { balance: number | string; expires_at: string };
  return { balance: toNumber(result.balance), expiresAt: result.expires_at };
}

export async function setDriverStatus(driverId: string, status: DriverStatus): Promise<void> {
  const { error } = await supabase.rpc('admin_set_driver_status', {
    p_driver_id: driverId,
    p_status: status,
  });
  if (error) throw error;
}

export async function topUpWallet(driverId: string, amount: number, note: string): Promise<number> {
  const { data, error } = await supabase.rpc('admin_topup_wallet', {
    p_driver_id: driverId,
    p_amount: amount,
    p_note: note,
  });
  if (error) throw error;
  return toNumber((data as { balance: number | string }).balance);
}

export async function listWalletTransactions(options: { driverId?: string; limit: number }): Promise<WalletTransaction[]> {
  let query = supabase
    .from('wallet_transactions')
    .select('id, driver_id, kind, amount, balance_after, note, created_at, drivers(name)')
    .order('created_at', { ascending: false })
    .limit(options.limit);
  if (options.driverId) query = query.eq('driver_id', options.driverId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as WalletTransactionRow[]).map(toWalletTransaction);
}

export async function createTrip(input: {
  driverId: string;
  clientName: string;
  clientPhone: string;
  province: string;
  city: string;
  pickup: string;
  dropoff: string;
  distanceKm: number | null;
  clientOffer: number;
  finalFare: number;
}): Promise<void> {
  const { error } = await supabase.from('trips').insert({
    driver_id: input.driverId,
    client_name: input.clientName,
    client_phone: input.clientPhone,
    province: input.province,
    city: input.city,
    pickup: input.pickup,
    dropoff: input.dropoff,
    distance_km: input.distanceKm,
    client_offer: input.clientOffer,
    final_fare: input.finalFare,
  });
  if (error) throw error;
}

// --- Real-time ride dispatch ---

export async function createPendingTrip(input: {
  clientName: string;
  clientPhone: string;
  province: string;
  city: string;
  pickup: string;
  dropoff: string;
  distanceKm: number | null;
  clientOffer: number;
  suggestedFare: number | null;
  pickupLat: number | null;
  pickupLng: number | null;
  vehicleType: string;
}): Promise<string> {
  const { data, error } = await supabase.from('trips').insert({
    client_name: input.clientName,
    client_phone: input.clientPhone,
    province: input.province,
    city: input.city,
    pickup: input.pickup,
    dropoff: input.dropoff,
    distance_km: input.distanceKm,
    client_offer: input.clientOffer,
    suggested_fare: input.suggestedFare,
    pickup_lat: input.pickupLat,
    pickup_lng: input.pickupLng,
    vehicle_type: input.vehicleType,
    status: 'pending',
  }).select('id').single();
  if (error) {
    console.error('[createPendingTrip] Supabase insert failed:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      input,
    });
    throw error;
  }
  return data.id;
}

export async function cancelPendingTrip(tripId: string): Promise<void> {
  const { error } = await supabase
    .from('trips')
    .update({ status: 'cancelled' })
    .eq('id', tripId)
    .eq('status', 'pending');
  if (error) throw error;
}

export async function acceptBidAndAssignDriver(tripId: string, bidId: string, driverId: string, finalFare: number): Promise<void> {
  const { error: bidError } = await supabase
    .from('ride_bids')
    .update({ status: 'accepted' })
    .eq('id', bidId);
  if (bidError) throw bidError;

  const { error: rejectError } = await supabase
    .from('ride_bids')
    .update({ status: 'rejected' })
    .eq('trip_id', tripId)
    .neq('id', bidId)
    .eq('status', 'pending');
  if (rejectError) throw rejectError;

  const { error: tripError } = await supabase
    .from('trips')
    .update({ status: 'active', driver_id: driverId, final_fare: finalFare })
    .eq('id', tripId)
    .eq('status', 'pending');
  if (tripError) throw tripError;
}

export async function getTripById(tripId: string): Promise<Trip | null> {
  const { data, error } = await supabase
    .from('trips')
    .select(TRIP_COLUMNS)
    .eq('id', tripId)
    .maybeSingle();
  if (error) throw error;
  return data ? toTrip(data as TripRow) : null;
}

export async function updateDriverLocation(driverId: string, lat: number, lng: number): Promise<void> {
  const { error } = await supabase
    .from('drivers')
    .update({ latitude: lat, longitude: lng })
    .eq('id', driverId);
  if (error) throw error;
}

export async function setDriverOnline(driverId: string, online: boolean): Promise<void> {
  const { error } = await supabase
    .from('drivers')
    .update({ is_online: online })
    .eq('id', driverId);
  if (error) throw error;
}

// --- Ride bids ---

export type RideBid = {
  id: string;
  tripId: string;
  driverId: string;
  driverName: string;
  vehicleType: string;
  offerAmount: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
};

type RideBidRow = {
  id: string;
  trip_id: string;
  driver_id: string;
  offer_amount: number | string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  drivers: { name: string; vehicle_type: string } | null;
};

const toRideBid = (row: RideBidRow): RideBid => ({
  id: row.id,
  tripId: row.trip_id,
  driverId: row.driver_id,
  driverName: row.drivers?.name ?? '-',
  vehicleType: row.drivers?.vehicle_type ?? '-',
  offerAmount: toNumber(row.offer_amount),
  status: row.status,
  createdAt: row.created_at,
});

export async function submitBid(tripId: string, driverId: string, offerAmount: number): Promise<void> {
  const { error } = await supabase.from('ride_bids').upsert({
    trip_id: tripId,
    driver_id: driverId,
    offer_amount: offerAmount,
    status: 'pending',
  }, { onConflict: 'trip_id,driver_id' });
  if (error) throw error;
}

export async function listBidsForTrip(tripId: string): Promise<RideBid[]> {
  const { data, error } = await supabase
    .from('ride_bids')
    .select('id, trip_id, driver_id, offer_amount, status, created_at, drivers(name, vehicle_type)')
    .eq('trip_id', tripId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as RideBidRow[]).map(toRideBid);
}

export type NearbyDriver = {
  driverId: string;
  driverName: string;
  vehicleType: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
};

export async function listNearbyOnlineDrivers(pickupLat: number, pickupLng: number, radiusKm: number = 5): Promise<NearbyDriver[]> {
  const { data, error } = await supabase.rpc('nearby_online_drivers', {
    p_pickup_lat: pickupLat,
    p_pickup_lng: pickupLng,
    p_radius_km: radiusKm,
  });
  if (error) throw error;
  return ((data ?? []) as { driver_id: string; driver_name: string; vehicle_type: string; latitude: number; longitude: number; distance_km: number }[]).map((row) => ({
    driverId: row.driver_id,
    driverName: row.driver_name,
    vehicleType: row.vehicle_type,
    latitude: row.latitude,
    longitude: row.longitude,
    distanceKm: row.distance_km,
  }));
}

export async function listPendingTripsForDriver(driverId: string): Promise<Trip[]> {
  const { data: nearby, error: nearbyError } = await supabase.rpc('nearby_online_drivers', {
    p_pickup_lat: 0,
    p_pickup_lng: 0,
    p_radius_km: 999999,
  });
  if (nearbyError) throw nearbyError;
  const isNearby = (nearby ?? []).some((d: { driver_id: string }) => d.driver_id === driverId);
  if (!isNearby) return [];

  const { data, error } = await supabase
    .from('trips')
    .select(TRIP_COLUMNS)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const allPending = ((data ?? []) as TripRow[]).map(toTrip);
  return allPending.filter((trip) => {
    if (trip.pickupLat === null || trip.pickupLng === null) return false;
    const nearbyRow = (nearby as { driver_id: string; distance_km: number }[]).find((d) => d.driver_id === driverId);
    if (!nearbyRow) return false;
    return nearbyRow.distance_km <= 5;
  });
}

export async function listActiveTripsForDriver(driverId: string): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select(TRIP_COLUMNS)
    .eq('driver_id', driverId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as TripRow[]).map(toTrip);
}

export async function completeTrip(tripId: string, driverPhone: string): Promise<CompleteTripResult> {
  const { data, error } = await supabase.rpc('complete_trip', {
    p_trip_id: tripId,
    p_driver_phone: driverPhone,
  });
  if (error) throw error;
  const result = data as {
    driver_earning: number | string;
    balance: number | string;
    original_fare: number | string;
    discount_amount: number | string;
    is_new_customer: boolean;
  };
  return {
    driverEarning: toNumber(result.driver_earning),
    balance: toNumber(result.balance),
    originalFare: toNumber(result.original_fare),
    discountAmount: toNumber(result.discount_amount),
    isNewCustomer: Boolean(result.is_new_customer),
  };
}

export async function listCompletedTripsSince(sinceIso: string): Promise<CompletedTripSummary[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('driver_id, driver_earning')
    .eq('status', 'completed')
    .gte('completed_at', sinceIso);
  if (error) throw error;
  return ((data ?? []) as { driver_id: string; driver_earning: number | string }[]).map((row) => ({
    driverId: row.driver_id,
    driverEarning: toNumber(row.driver_earning),
  }));
}

export async function isCustomerNew(phone: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('trips')
    .select('created_at')
    .eq('client_phone', phone)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return true;
  const firstTripDate = new Date(data[0].created_at).getTime();
  return Date.now() - firstTripDate < 15 * 24 * 60 * 60 * 1000;
}

const ERROR_MESSAGES: Record<string, string> = {
  driver_not_found: 'لم نجد هذا الكابتن',
  trip_not_found: 'هذه الرحلة غير موجودة',
  trip_not_active: 'هذه الرحلة منتهية بالفعل',
  trip_has_no_fare: 'لا يوجد سعر متفق عليه لهذه الرحلة',
  invalid_amount: 'المبلغ غير صحيح',
  invalid_status: 'الحالة غير صحيحة',
  insufficient_balance: 'رصيد المحفظة غير كافٍ لتجديد الاشتراك، اشحن المحفظة أولاً',
  subscription_price_invalid: 'سعر الاشتراك غير مضبوط، تواصل مع الإدارة',
  invalid_account_kind: 'نوع الحساب غير صحيح',
  invalid_account_label: 'اسم الحساب يجب أن يكون من 1 إلى 60 حرفًا',
  invalid_account_number: 'رقم الحساب غير صحيح',
  payment_account_not_found: 'هذا الحساب غير موجود',
  invalid_decision: 'القرار غير صحيح',
  proof_not_found: 'هذا التحويل غير موجود',
  proof_already_reviewed: 'تمت مراجعة هذا التحويل بالفعل',
  invalid_driver_fields: 'يرجى تعبئة الاسم ونوع المركبة',
  invalid_phone: 'رقم الهاتف غير صحيح',
  phone_taken: 'هذا الرقم مسجل لكابتن آخر',
  not_authorized: 'هذا الإجراء متاح للمديرين فقط',
  trip_completed: 'لا يمكن حذف رحلة مكتملة لأنها سجل مالي',
  invalid_admin_email: 'البريد الإلكتروني للمدير غير صحيح',
  admin_exists: 'هذا البريد مضاف كمدير بالفعل',
  admin_not_found: 'هذا المدير غير موجود',
  cannot_remove_main_admin: 'لا يمكن حذف المدير الرئيسي',
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : '';
  return ERROR_MESSAGES[message] ?? fallback;
}
