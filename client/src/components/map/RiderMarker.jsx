import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';

const ROLE_COLORS = {
  lead:  '#FFE500',
  sweep: '#FF6B00',
  rider: '#FFFFFF',
};

function makeIcon(color, isSelf, role) {
  const size  = isSelf ? 18 : 13;
  const label = role === 'lead' ? 'L' : role === 'sweep' ? 'S' : '';
  const ring  = isSelf
    ? `<circle cx="20" cy="20" r="17" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.4"/>`
    : '';
  const svg = `
    <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      ${ring}
      <circle cx="20" cy="20" r="${size / 2 + 4}" fill="${color}" opacity="0.2"/>
      <circle cx="20" cy="20" r="${size / 2}" fill="${color}"/>
      ${label ? `<text x="20" y="24" text-anchor="middle" font-size="9" fill="#000" font-weight="bold">${label}</text>` : ''}
    </svg>`;
  return L.divIcon({
    html:        svg,
    className:   '',
    iconSize:    [40, 40],
    iconAnchor:  [20, 20],
    tooltipAnchor: [0, -22],
  });
}

export default function RiderMarker({ rider, isSelf }) {
  if (!rider.lat || !rider.lng) return null;

  const color = (rider.online !== false) ? (ROLE_COLORS[rider.role] ?? '#FFFFFF') : '#555555';
  const icon  = makeIcon(color, isSelf, rider.online !== false ? rider.role : null);

  const label = [
    rider.displayName,
    rider.speed > 2    ? `${rider.speed}km/h`      : null,
    rider.battery != null ? `🔋${rider.battery}%`  : null,
  ].filter(Boolean).join(' · ');

  return (
    <Marker position={[rider.lat, rider.lng]} icon={icon}>
      <Tooltip
        permanent
        direction="top"
        offset={[0, -22]}
        className="leaflet-rider-tooltip"
      >
        {label}
      </Tooltip>
    </Marker>
  );
}
