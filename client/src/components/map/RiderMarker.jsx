import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';

const ROLE_COLORS = {
  lead:  '#FFE500',
  sweep: '#FF6B00',
  rider: '#FFFFFF',
};

function makeIcon(role, isSelf, online) {
  const color = online ? ROLE_COLORS[role] ?? '#FFFFFF' : '#555555';
  const size = isSelf ? 18 : 14;
  const ring = isSelf ? `<circle cx="20" cy="20" r="17" fill="none" stroke="${color}" stroke-width="2" opacity="0.5"/>` : '';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
      ${ring}
      <circle cx="20" cy="20" r="${size / 2 + 4}" fill="${color}" opacity="0.2"/>
      <circle cx="20" cy="20" r="${size / 2}" fill="${color}"/>
      ${role === 'lead' ? '<text x="20" y="24" text-anchor="middle" font-size="10" fill="#000">L</text>' : ''}
      ${role === 'sweep' ? '<text x="20" y="24" text-anchor="middle" font-size="10" fill="#000">S</text>' : ''}
    </svg>`;

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    tooltipAnchor: [20, -10],
  });
}

export default function RiderMarker({ rider, isSelf }) {
  if (!rider.lat || !rider.lng) return null;

  return (
    <Marker
      position={[rider.lat, rider.lng]}
      icon={makeIcon(rider.role, isSelf, rider.online !== false)}
    >
      <Tooltip permanent={isSelf} direction="top" offset={[0, -10]}>
        <span className="text-xs font-bold">
          {rider.displayName}{rider.speed ? ` · ${rider.speed}km/h` : ''}
          {rider.battery != null ? ` · 🔋${rider.battery}%` : ''}
        </span>
      </Tooltip>
    </Marker>
  );
}
