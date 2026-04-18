import { Polyline } from 'react-leaflet';

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

        return (
          <Polyline
            key={riderId}
            positions={points}
            pathOptions={{
              color,
              weight:    3,
              opacity:   0.4,
              dashArray: '6 8',
            }}
          />
        );
      })}
    </>
  );
}
