import { Polyline } from '@react-google-maps/api';

const ROLE_COLORS = {
  lead:  '#FFE500',
  sweep: '#FF6B00',
  rider: '#60A5FA',
};

export default function TrailLayer({ trails, riders, selfId }) {
  return (
    <>
      {Object.entries(trails).map(([riderId, points]) => {
        if (points.length < 2) return null;
        const rider = riders.find((r) => r.riderId === riderId);
        const color = riderId === selfId
          ? '#FFFFFF'
          : (ROLE_COLORS[rider?.role] ?? ROLE_COLORS.rider);

        // Convert [lat,lng] arrays to { lat, lng } objects for Google Maps
        const path = points.map(([lat, lng]) => ({ lat, lng }));

        return (
          <Polyline
            key={riderId}
            path={path}
            options={{
              strokeColor:   color,
              strokeWeight:  3,
              strokeOpacity: 0.4,
              icons: [{
                icon:   { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
                offset: '0',
                repeat: '12px',
              }],
            }}
          />
        );
      })}
    </>
  );
}
