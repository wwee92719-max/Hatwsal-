import type { VehicleType } from '@/data/vehicles';

export type PricingSettings = {
  baseFare: number;
  perKm: number;
  perMinute: number;
  minimumFare: number;
};

export const DEFAULT_PRICING: PricingSettings = {
  baseFare: 15,
  perKm: 3,
  perMinute: 0.5,
  minimumFare: 20,
};

export function calculateTripFare(
  settings: PricingSettings,
  vehicle: Pick<VehicleType, 'perKm' | 'perMinute'>,
  distanceKm: number,
  durationMin: number,
): number {
  const raw =
    settings.baseFare +
    (settings.perKm + vehicle.perKm) * distanceKm +
    (settings.perMinute + vehicle.perMinute) * durationMin;
  return Math.max(Math.round(raw), settings.minimumFare);
}
