import { useEffect } from 'react';
import { Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';

const destIcon = L.divIcon({
  html: `<div style="width:22px;height:22px;background:#FFE500;border:3px solid #0F0F0F;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 10px rgba(0,0,0,0.6)"></div>`,
  className: '',
  iconSize:   [22, 22],
  iconAnchor: [11, 22],
});

function FitBounds({ polyline }) {
  const map = useMap();
  useEffect(() => {
    if (!polyline?.length) return;
    const bounds = L.latLngBounds(polyline.map(([lat, lng]) => [lat, lng]));
    map.fitBounds(bounds, { paddingTopLeft: [60, 130], paddingBottomRight: [60, 130] });
  }, [polyline?.[0], polyline?.[polyline?.length - 1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// `route` = { polyline: [[lat,lng],...], destination: {lat,lng}, distance, duration }
export default function RouteLayer({ route }) {
  if (!route) return null;

  const positions = route.polyline.map(([lat, lng]) => [lat, lng]);

  return (
    <>
      <FitBounds polyline={route.polyline} />
      <Polyline
        positions={positions}
        pathOptions={{ color: '#4A90E2', weight: 5, opacity: 0.9 }}
      />
      {route.destination && (
        <Marker
          position={[route.destination.lat, route.destination.lng]}
          icon={destIcon}
        />
      )}
    </>
  );
}
