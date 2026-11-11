import { supabase } from '@/lib/supabase';
import { toNumber } from '@/lib/api';

export type PaymentAccountKind = 'bank' | 'etisalat_cash' | 'vodafone_cash' | 'other';

export type PaymentAccount = {
  id: string;
  kind: PaymentAccountKind;
  label: string;
  accountNumber: string;
  holderName: string;
  isActive: boolean;
};

export type PaymentProofStatus = 'pending' | 'approved' | 'rejected';

export type PaymentProof = {
  id: string;
  driverId: string;
  driverName: string;
  accountLabel: string;
  amount: number;
  screenshotPath: string;
  status: PaymentProofStatus;
  createdAt: string;
  reviewedAt: string | null;
};

export type AdminTrip = {
  id: string;
  driverId: string | null;
  driverName: string;
  clientName: string;
  clientPhone: string;
  pickup: string;
  dropoff: string;
  finalFare: number | null;
  status: 'active' | 'completed';
  createdAt: string;
};

type PaymentAccountRow = {
  id: string;
  kind: PaymentAccountKind;
  label: string;
  account_number: string;
  holder_name: string;
  is_active: boolean;
};

type PaymentProofRow = {
  id: string;
  driver_id: string;
  amount: number | string;
  screenshot_path: string;
  status: PaymentProofStatus;
  created_at: string;
  reviewed_at: string | null;
  drivers: { name: string } | null;
  payment_accounts: { label: string } | null;
};

type AdminTripRow = {
  id: string;
  driver_id: string | null;
  client_name: string;
  client_phone: string;
  pickup: string;
  dropoff: string;
  final_fare: number | string | null;
  status: 'active' | 'completed';
  created_at: string;
  drivers: { name: string } | null;
};

const PAYMENT_BUCKET = 'payment-proofs';
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const SCREENSHOT_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const toPaymentAccount = (row: PaymentAccountRow): PaymentAccount => ({
  id: row.id,
  kind: row.kind,
  label: row.label,
  accountNumber: row.account_number,
  holderName: row.holder_name,
  isActive: row.is_active,
});

const toPaymentProof = (row: PaymentProofRow): PaymentProof => ({
  id: row.id,
  driverId: row.driver_id,
  driverName: row.drivers?.name ?? '-',
  accountLabel: row.payment_accounts?.label ?? '-',
  amount: toNumber(row.amount),
  screenshotPath: row.screenshot_path,
  status: row.status,
  createdAt: row.created_at,
  reviewedAt: row.reviewed_at,
});

const toAdminTrip = (row: AdminTripRow): AdminTrip => ({
  id: row.id,
  driverId: row.driver_id,
  driverName: row.drivers?.name ?? '-',
  clientName: row.client_name,
  clientPhone: row.client_phone,
  pickup: row.pickup,
  dropoff: row.dropoff,
  finalFare: row.final_fare === null ? null : Number(row.final_fare),
  status: row.status,
  createdAt: row.created_at,
});

export async function listPaymentAccounts(options: { includeInactive?: boolean } = {}): Promise<PaymentAccount[]> {
  let query = supabase
    .from('payment_accounts')
    .select('id, kind, label, account_number, holder_name, is_active')
    .order('created_at', { ascending: true });
  if (!options.includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as PaymentAccountRow[]).map(toPaymentAccount);
}

export async function savePaymentAccount(input: {
  id: string | null;
  kind: PaymentAccountKind;
  label: string;
  accountNumber: string;
  holderName: string;
  isActive: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc('admin_upsert_payment_account', {
    p_id: input.id,
    p_kind: input.kind,
    p_label: input.label,
    p_account_number: input.accountNumber,
    p_holder_name: input.holderName,
    p_is_active: input.isActive,
  });
  if (error) throw error;
}

export async function submitPaymentProof(input: {
  driverId: string;
  paymentAccountId: string;
  amount: number;
  file: File;
}): Promise<void> {
  const extension = SCREENSHOT_EXTENSIONS[input.file.type];
  if (!extension) throw new Error('invalid_file_type');
  if (input.file.size > MAX_SCREENSHOT_BYTES) throw new Error('file_too_large');

  const path = `${input.driverId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(PAYMENT_BUCKET)
    .upload(path, input.file, { contentType: input.file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from('payment_proofs').insert({
    driver_id: input.driverId,
    payment_account_id: input.paymentAccountId,
    amount: input.amount,
    screenshot_path: path,
  });
  if (error) {
    await supabase.storage.from(PAYMENT_BUCKET).remove([path]);
    throw error;
  }
}

export async function listPaymentProofs(options: { driverId?: string; status?: PaymentProofStatus } = {}): Promise<PaymentProof[]> {
  let query = supabase
    .from('payment_proofs')
    .select('id, driver_id, amount, screenshot_path, status, created_at, reviewed_at, drivers(name), payment_accounts(label)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (options.driverId) query = query.eq('driver_id', options.driverId);
  if (options.status) query = query.eq('status', options.status);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as PaymentProofRow[]).map(toPaymentProof);
}

export async function getPaymentProofScreenshotUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(PAYMENT_BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw error ?? new Error('signed_url_missing');
  return data.signedUrl;
}

export async function reviewPaymentProof(proofId: string, decision: 'approve' | 'reject'): Promise<void> {
  const { error } = await supabase.rpc('admin_review_payment_proof', {
    p_proof_id: proofId,
    p_decision: decision,
  });
  if (error) throw error;
}

export async function updateDriver(input: {
  driverId: string;
  name: string;
  phone: string;
  address: string;
  vehicleType: string;
}): Promise<void> {
  const { error } = await supabase.rpc('admin_update_driver', {
    p_driver_id: input.driverId,
    p_name: input.name,
    p_phone: input.phone,
    p_address: input.address,
    p_vehicle_type: input.vehicleType,
  });
  if (error) {
    if (error.code === '23505') throw new Error('phone_taken');
    throw error;
  }
}

export async function deleteDriver(driverId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_driver', { p_driver_id: driverId });
  if (error) throw error;
}

export async function listAdminTrips(limit: number): Promise<AdminTrip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('id, driver_id, client_name, client_phone, pickup, dropoff, final_fare, status, created_at, drivers(name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as AdminTripRow[]).map(toAdminTrip);
}

export async function deleteTrip(tripId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_trip', { p_trip_id: tripId });
  if (error) throw error;
}

const DRIVER_ID_BUCKET = 'driver-ids';

export async function getDriverIdPhotoUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DRIVER_ID_BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw error ?? new Error('signed_url_missing');
  return data.signedUrl;
}

export type AdminUser = {
  id: string;
  email: string;
  isMain: boolean;
  createdAt: string;
};

type AdminUserRow = {
  id: string;
  email: string;
  is_main: boolean;
  created_at: string;
};

export async function listAdmins(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_list_admins');
  if (error) throw error;
  return ((data ?? []) as AdminUserRow[]).map((row) => ({
    id: row.id,
    email: row.email,
    isMain: row.is_main,
    createdAt: row.created_at,
  }));
}

export async function addAdmin(email: string): Promise<void> {
  const { error } = await supabase.rpc('admin_add_admin', { p_email: email });
  if (error) throw error;
}

export async function removeAdmin(adminId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_remove_admin', { p_admin_id: adminId });
  if (error) throw error;
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin_user');
  if (error) throw error;
  return data === true;
}

export type AdminCodeRequestResult = 'sent' | 'not_added' | 'invalid' | 'rate_limited' | 'failed';

const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SEND_CODE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-send-code`;

export async function requestAdminCode(email: string): Promise<AdminCodeRequestResult> {
  try {
    const response = await fetch(SEND_CODE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (response.ok && body?.ok === true) return 'sent';
    if (body?.error === 'not_added') return 'not_added';
    if (body?.error === 'invalid_email') return 'invalid';
    if (body?.error === 'rate_limited') return 'rate_limited';
    return 'failed';
  } catch {
    return 'failed';
  }
}

export async function verifyAdminCode(email: string, code: string): Promise<boolean> {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) return false;
  const admin = await isCurrentUserAdmin();
  if (!admin) await supabase.auth.signOut();
  return admin;
}

