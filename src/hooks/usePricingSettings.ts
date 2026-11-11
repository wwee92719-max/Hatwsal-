import { useEffect, useState } from 'react';
import { getPricingSettings } from '@/lib/appSettings';
import { DEFAULT_PRICING, type PricingSettings } from '@/lib/pricing';

export function usePricingSettings(): PricingSettings {
  const [settings, setSettings] = useState<PricingSettings>(DEFAULT_PRICING);
  useEffect(() => {
    getPricingSettings().then(setSettings).catch(() => setSettings(DEFAULT_PRICING));
  }, []);
  return settings;
}
