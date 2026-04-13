import { useEffect } from 'react';
import { Polyline, OverlayView } from '@react-google-maps/api';

// Unified route renderer — works for both self-navigation and shared routes.
// `route` = { polyline: [[lat,lng],...], destination: {lat,lng}, distance, duration }
export default function RouteLayer({ route, mapRef }) {
  useEffect(() => {
    if (!route?.polyline?.length || !mapRef?.current) return;
    const bounds = new window.google.maps.LatLngBounds();
    route.polyline.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
    mapRef.current.fitBounds(bounds, { top: 130, bottom: 130, left: 60, right: 60 });
  }, [route?.destination?.lat, route?.destination?.lng]);

  if (!route) return null;

  const path = route.polyline.map(([lat, lng]) => ({ lat, lng }));

  return (
    <>
      <Polyline
        path={path}
        options={{ strokeColor: '#4A90E2', strokeWeight: 5, strokeOpacity: 0.9 }}
      />
      {route.destination && (
        <OverlayView
          position={{ lat: route.destination.lat, lng: route.destination.lng }}
          mapPaneName={OverlayView.OVERLAY_LAYER}
        >
          <div style={{
            width: 22, height: 22,
            background: '#FFE500',
            border: '3px solid #0F0F0F',
            borderRadius: '50% 50% 50% 0',
            transform: 'translate(-50%, -100%) rotate(-45deg)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
          }} />
        </OverlayView>
      )}
    </>
  );
}
