import { OverlayView } from '@react-google-maps/api';

const ROLE_COLORS = {
  lead:  '#FFE500',
  sweep: '#FF6B00',
  rider: '#FFFFFF',
};

export default function RiderMarker({ rider, isSelf }) {
  if (!rider.lat || !rider.lng) return null;

  const color  = (rider.online !== false) ? (ROLE_COLORS[rider.role] ?? '#FFFFFF') : '#555555';
  const size   = isSelf ? 18 : 13;
  const pos    = { lat: rider.lat, lng: rider.lng };

  return (
    <OverlayView
      position={pos}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div style={{ transform: 'translate(-50%, -50%)', position: 'relative', width: 40, height: 40 }}>
        {/* Label above marker */}
        <div
          style={{
            position:       'absolute',
            bottom:         '110%',
            left:           '50%',
            transform:      'translateX(-50%)',
            whiteSpace:     'nowrap',
            background:     'rgba(15,15,15,0.85)',
            border:         `1px solid ${color}40`,
            color:          '#ffffff',
            fontSize:       11,
            fontWeight:     600,
            borderRadius:   8,
            padding:        '2px 7px',
            pointerEvents:  'none',
          }}
        >
          {rider.displayName}
          {rider.speed > 2 ? ` · ${rider.speed}km/h` : ''}
          {rider.battery != null ? ` · 🔋${rider.battery}%` : ''}
        </div>

        {/* Dot */}
        <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          {isSelf && (
            <circle cx="20" cy="20" r="17" fill="none" stroke={color} strokeWidth="1.5" opacity="0.4" />
          )}
          <circle cx="20" cy="20" r={size / 2 + 4} fill={color} opacity="0.2" />
          <circle cx="20" cy="20" r={size / 2} fill={color} />
          {rider.role === 'lead'  && <text x="20" y="24" textAnchor="middle" fontSize="9" fill="#000" fontWeight="bold">L</text>}
          {rider.role === 'sweep' && <text x="20" y="24" textAnchor="middle" fontSize="9" fill="#000" fontWeight="bold">S</text>}
        </svg>
      </div>
    </OverlayView>
  );
}
