import { useEffect, useRef, useState } from 'react';
import type { VehicleType } from '@/data/vehicles';
import type { PricingSettings } from '@/lib/pricing';
import { calculateTripFare } from '@/lib/pricing';
import { computeRoute, geocodeAddress, reverseGeocode, type LatLng, type RouteSummary } from '@/lib/tripRoute';

export type PickMode = 'pickup' | 'dropoff' | null;

const GEOCODE_DELAY_MS = 700;
const MIN_QUERY_LENGTH = 3;

function useAddressPoint(text: string) {
  const [point, setPoint] = useState<LatLng | null>(null);
  const resolvedText = useRef('');

  useEffect(() => {
    const query = text.trim();
    if (query === resolvedText.current) return;
    if (query.length < MIN_QUERY_LENGTH) {
      resolvedText.current = '';
      setPoint(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      geocodeAddress(query)
        .then((found) => {
          if (cancelled) return;
          resolvedText.current = query;
          setPoint(found);
        })
        .catch(() => {
          if (!cancelled) setPoint(null);
        });
    }, GEOCODE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);

  const setPointFromMap = (nextPoint: LatLng, address: string) => {
    resolvedText.current = address.trim();
    setPoint(nextPoint);
  };

  return { point, setPointFromMap };
}

type Options = {
  pickupText: string;
  dropoffText: string;
  setPickupText: (text: string) => void;
  setDropoffText: (text: string) => void;
  vehicle: VehicleType | null;
  pricing: PricingSettings;
};

export function useTripPlanner({
  pickupText,
  dropoffText,
  setPickupText,
  setDropoffText,
  vehicle,
  pricing,
}: Options) {
  const pickup = useAddressPoint(pickupText);
  const dropoff = useAddressPoint(dropoffText);
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState('');

  useEffect(() => {
    if (!pickup.point || !dropoff.point) {
      setRoute(null);
      setRouteError('');
      setRouting(false);
      return;
    }
    let cancelled = false;
    setRouting(true);
    setRouteError('');
    computeRoute(pickup.point, dropoff.point)
      .then((result) => {
        if (!cancelled) setRoute(result);
      })
      .catch(() => {
        if (cancelled) return;
        setRoute(null);
        setRouteError('تعذر حساب المسافة بين المكانين');
      })
      .finally(() => {
        if (!cancelled) setRouting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pickup.point, dropoff.point]);

  const fare = vehicle && route ? calculateTripFare(pricing, vehicle, route.distanceKm, route.durationMin) : null;

  const handleMapPick = async (point: LatLng) => {
    if (!pickMode) return;
    const target = pickMode;
    const address =
      (await reverseGeocode(point).catch(() => null)) ?? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
    if (target === 'pickup') {
      pickup.setPointFromMap(point, address);
      setPickupText(address);
      setPickMode(dropoff.point ? null : 'dropoff');
    } else {
      dropoff.setPointFromMap(point, address);
      setDropoffText(address);
      setPickMode(pickup.point ? null : 'pickup');
    }
  };

  return {
    pickupPoint: pickup.point,
    dropoffPoint: dropoff.point,
    route,
    routing,
    routeError,
    fare,
    pickMode,
    setPickMode,
    handleMapPick,
  };
}
