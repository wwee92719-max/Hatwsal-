import L from '@/lib/leafletConfig';

export type LatLng = { lat: number; lng: number };

export type RouteSummary = {
  distanceKm: number;
  durationMin: number;
  polyline: [number, number][];
};

// Photon API (komoot.io) — faster, more accurate for Egyptian locations
const PHOTON_BASE = 'https://photon.komoot.io/api';
const EGYPT_LAT = 26.8;
const EGYPT_LON = 30.8;
const EGYPT_BIAS_SCALE = 0.1; // strong bias toward Egypt

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    city?: string;
    street?: string;
    state?: string;
    country?: string;
    postcode?: string;
    osm_value?: string;
  };
};

function formatPhotonFeature(f: PhotonFeature): string {
  const p = f.properties;
  const parts = [p.name, p.street, p.city, p.state, p.country].filter(Boolean);
  return parts.join('، ') || p.name || 'موقع غير معروف';
}

function photonFeatureToSuggestion(f: PhotonFeature): AddressSuggestion {
  const [lng, lat] = f.geometry.coordinates;
  return {
    displayName: formatPhotonFeature(f),
    lat,
    lng,
  };
}

export async function geocodeAddress(address: string): Promise<LatLng | null> {
  if (address.trim().length < 3) return null;
  const url = `${PHOTON_BASE}/?q=${encodeURIComponent(address)}&lat=${EGYPT_LAT}&lon=${EGYPT_LON}&lang=ar&limit=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: PhotonFeature[] };
    const feature = data.features?.[0];
    if (!feature) return null;
    const [lng, lat] = feature.geometry.coordinates;
    return { lat, lng };
  } catch {
    return null;
  }
}

export type AddressSuggestion = {
  displayName: string;
  lat: number;
  lng: number;
};

export async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  if (query.trim().length < 3) return [];
  const url = `${PHOTON_BASE}/?q=${encodeURIComponent(query)}&lat=${EGYPT_LAT}&lon=${EGYPT_LON}&lang=ar&limit=8`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: PhotonFeature[] };
    return (data.features ?? []).map(photonFeatureToSuggestion);
  } catch {
    return [];
  }
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
