import { supabase } from '@/lib/supabase';
import { DEFAULT_PRICING, type PricingSettings } from '@/lib/pricing';

export const SUBSCRIPTION_PRICE_DEFAULT = 300;

export async function getPricingSettings(): Promise<PricingSettings> {
  const { data, error } = await supabase.from('app_settings').select('key, value').in('key', [
    'pricing_base_fare',
    'pricing_per_km',
    'pricing_per_minute',
    'pricing_minimum_fare',
  ]);
  if (error) return DEFAULT_PRICING;
  const map = new Map((data ?? []).map((row) => [row.key, row.value]));
  return {
    baseFare: parseFloat(map.get('pricing_base_fare') ?? '') || DEFAULT_PRICING.baseFare,
    perKm: parseFloat(map.get('pricing_per_km') ?? '') || DEFAULT_PRICING.perKm,
    perMinute: parseFloat(map.get('pricing_per_minute') ?? '') || DEFAULT_PRICING.perMinute,
    minimumFare: parseFloat(map.get('pricing_minimum_fare') ?? '') || DEFAULT_PRICING.minimumFare,
  };
}

export async function savePricingSettings(settings: PricingSettings): Promise<void> {
  const rows = [
    { key: 'pricing_base_fare', value: String(settings.baseFare) },
    { key: 'pricing_per_km', value: String(settings.perKm) },
    { key: 'pricing_per_minute', value: String(settings.perMinute) },
    { key: 'pricing_minimum_fare', value: String(settings.minimumFare) },
  ];
  const { error } = await supabase
    .from('app_settings')
    .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'key' });
  if (error) throw error;
}

export async function getSubscriptionPrice(): Promise<number> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'subscription_price')
    .maybeSingle();
  if (error) throw error;
  return parseFloat(data?.value ?? '') || SUBSCRIPTION_PRICE_DEFAULT;
}

export async function saveSubscriptionPrice(price: number): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'subscription_price', value: String(price), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}
