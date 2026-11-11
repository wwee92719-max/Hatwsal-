import { useEffect, useRef } from 'react';
import { MapPin, Navigation, Loader2 } from 'lucide-react';
import L from '@/lib/leafletConfig';
import { pickupIcon, dropoffIcon } from '@/lib/leafletConfig';
import type { LatLng, RouteSummary } from '@/lib/tripRoute';
import type { PickMode } from '@/hooks/useTripPlanner';

const EGYPT_CENTER: LatLng = { lat: 26.8206, lng: 30.8025 };

type Props = {
  pickup: LatLng | null;
  dropoff: LatLng | null;
  route: RouteSummary | null;
  routing: boolean;
  routeError: string;
  pickMode: PickMode;
  onPickModeChange: (mode: PickMode) => void;
  onMapPick: (point: LatLng) => void;
};

export function TripMap({
  pickup,
  dropoff,
  route,
  routing,
  routeError,
  pickMode,
  onPickModeChange,
  onMapPick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const dropoffMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const onMapPickRef = useRef(onMapPick);

  useEffect(() => {
    onMapPickRef.current = onMapPick;
  }, [onMapPick]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [EGYPT_CENTER.lat, EGYPT_CENTER.lng],
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapPickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (pickup) {
      if (!pickupMarkerRef.current) {
        pickupMarkerRef.current = L.marker([pickup.lat, pickup.lng], { icon: pickupIcon }).addTo(map);
      } else {
        pickupMarkerRef.current.setLatLng([pickup.lat, pickup.lng]);
      }
    } else {
      pickupMarkerRef.current?.remove();
      pickupMarkerRef.current = null;
    }

    if (dropoff) {
      if (!dropoffMarkerRef.current) {
        dropoffMarkerRef.current = L.marker([dropoff.lat, dropoff.lng], { icon: dropoffIcon }).addTo(map);
      } else {
        dropoffMarkerRef.current.setLatLng([dropoff.lat, dropoff.lng]);
      }
    } else {
      dropoffMarkerRef.current?.remove();
      dropoffMarkerRef.current = null;
    }

    if (pickup && dropoff) {
      const bounds = L.latLngBounds([pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]);
      map.fitBounds(bounds, { padding: [60, 60] });
    } else {
      const single = pickup ?? dropoff;
      if (single) {
        map.setView([single.lat, single.lng], 15);
      }
    }
  }, [pickup, dropoff]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    polylineRef.current?.remove();
    polylineRef.current = null;
    if (route && route.polyline.length > 0) {
      polylineRef.current = L.polyline(route.polyline, {
        color: '#FF6600',
        weight: 5,
        opacity: 0.8,
      }).addTo(map);
    }
  }, [route]);

  const statusText = (() => {
    if (pickMode) {
      return `اضغط على الخريطة لتحديد ${pickMode === 'pickup' ? 'مكان الركوب' : 'مكان الوصول'}`;
    }
    if (routing) return 'جاري حساب المسافة...';
    if (route) {
      return `المسافة: ${route.distanceKm.toFixed(1)} كم · الوقت المتوقع: ${Math.round(route.durationMin)} دقيقة`;
    }
    if (routeError) return routeError;
    return 'اكتب العنوان أو اضغط على الخريطة لتحديد المكان';
  })();

  const pickButtonClass = (mode: Exclude<PickMode, null>) =>
    `flex items-center justify-center gap-1.5 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-all active:scale-95 ${
      pickMode === mode
        ? 'border-brand-500 bg-brand-50 text-brand-600'
        : 'border-gray-200 bg-white text-navy-600 hover:border-brand-300'
    }`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onPickModeChange(pickMode === 'pickup' ? null : 'pickup')}
          className={pickButtonClass('pickup')}
        >
          <MapPin size={16} /> تحديد الركوب
        </button>
        <button
          type="button"
          onClick={() => onPickModeChange(pickMode === 'dropoff' ? null : 'dropoff')}
          className={pickButtonClass('dropoff')}
        >
          <Navigation size={16} /> تحديد الوصول
        </button>
      </div>

      <div className="relative h-64 overflow-hidden rounded-xl bg-gray-100">
        <div ref={containerRef} className="h-full w-full" />
        {routing && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 className="animate-spin text-brand-500" size={24} />
          </div>
        )}
      </div>

      <p className={`text-center text-sm font-semibold ${route ? 'text-brand-600' : 'text-navy-500'}`}>
        {statusText}
      </p>
    </div>
  );
}
