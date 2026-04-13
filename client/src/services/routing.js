// Utility functions shared between NavigationPanel and other components.
// Geocoding and routing are now handled by Google Maps JS API directly.

const API = `${import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000'}/api`;

export function formatDistance(meters) {
  if (meters == null) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds) {
  if (seconds == null) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R    = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function maneuverIcon(maneuver = '') {
  const m = maneuver.toLowerCase();
  if (m.includes('arrived') || m.includes('arrive'))      return '🏁';
  if (m.includes('turn-left')  || m.includes('left'))     return '↰';
  if (m.includes('turn-right') || m.includes('right'))    return '↱';
  if (m.includes('roundabout') || m.includes('rotary'))   return '🔄';
  if (m.includes('uturn') || m.includes('u-turn'))        return '↩';
  if (m.includes('merge'))                                 return '⬆';
  if (m.includes('ramp'))                                  return '↗';
  if (m.includes('fork'))                                  return '↗';
  return '⬆';
}
