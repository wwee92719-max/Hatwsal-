import L from '@/lib/leafletConfig';

export type LatLng = { lat: number; lng: number };

export type RouteSummary = {
  distanceKm: number;
  durationMin: number;
  polyline: [number, number][];
};

export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=eg&limit=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'ar' } });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

export async function reverseGeocode(point: LatLng): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${point.lat}&lon=${point.lng}&accept-language=ar`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { display_name?: string };
  return data.display_name ?? null;
}

export async function computeRoute(origin: LatLng, destination: LatLng): Promise<RouteSummary> {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('routing_failed');
  const data = (await res.json()) as {
    routes?: Array<{ distance: number; duration: number; geometry: { coordinates: [number, number][] } }>;
  };
  const route = data.routes?.[0];
  if (!route) throw new Error('no_route');
  return {
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    polyline: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
  };
}

export function createPolyline(points: [number, number][]): L.Polyline {
  return L.polyline(points, { color: '#FF6600', weight: 5, opacity: 0.8 });
}
