import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default marker icons that break with bundlers
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

export const pickupIcon = L.divIcon({
  html: '<div style="background:#FF6600;width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:14px;">ر</div>',
  className: 'pickup-marker',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export const dropoffIcon = L.divIcon({
  html: '<div style="background:#1e293b;width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:14px;">و</div>',
  className: 'dropoff-marker',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export default L;
