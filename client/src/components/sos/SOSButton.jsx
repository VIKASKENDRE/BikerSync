import { useState, useRef, useEffect } from 'react';
import { socket } from '../../services/socket';
import { useRideContext } from '../../context/RideContext';
import { webrtcMesh } from '../../services/webrtcMesh';
import { api } from '../../services/api';

export default function SOSButton() {
  const { state, dispatch } = useRideContext();
  const [status, setStatus] = useState('idle'); // idle | holding | sent

  // Reset button when SOS is resolved by any rider (sosAlert cleared in context)
  useEffect(() => {
    if (state.sosAlert === null && status === 'sent') {
      setStatus('idle');
    }
  }, [state.sosAlert]);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimer = useRef(null);
  const progressTimer = useRef(null);

  const startHold = () => {
    if (status === 'sent') return;
    setStatus('holding');
    setHoldProgress(0);

    let p = 0;
    progressTimer.current = setInterval(() => {
      p += 5;
      setHoldProgress(Math.min(p, 100));
      if (p >= 100) clearInterval(progressTimer.current);
    }, 100);

    holdTimer.current = setTimeout(() => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const payload = {
            rideId:      state.rideId,
            riderId:     state.selfRider?.riderId,
            displayName: state.selfRider?.displayName,
            lat:         pos.coords.latitude,
            lng:         pos.coords.longitude,
            battery:     state.selfRider?.battery ?? null,
            timestamp:   Date.now(),
          };
          if (socket.connected) {
            socket.emit('sos:trigger', payload);
            try { await api.triggerSOS(payload); } catch {}
          } else {
            // P2P mode — broadcast to peers and confirm locally
            webrtcMesh.broadcastSOS(payload);
            dispatch({ type: 'SOS_RECEIVED', payload });
          }
          setStatus('sent');
        },
        () => cancelHold()
      );
    }, 2000);
  };

  const cancelHold = () => {
    clearTimeout(holdTimer.current);
    clearInterval(progressTimer.current);
    if (status !== 'sent') {
      setStatus('idle');
      setHoldProgress(0);
    }
  };

  const colors = {
    idle:    'bg-red-700/80 border-red-500',
    holding: 'bg-red-600 border-red-400 scale-110',
    sent:    'bg-red-600 border-red-400 animate-pulse shadow-sos',
  };

  return (
    <button
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onTouchStart={(e) => { e.preventDefault(); startHold(); }}
      onTouchEnd={cancelHold}
      onTouchCancel={cancelHold}
      className={`w-14 h-14 rounded-full font-black text-white text-sm
                  border-2 shadow-lg select-none transition-all duration-150
                  flex flex-col items-center justify-center gap-0.5
                  ${colors[status]}`}
      aria-label="SOS — hold 2 seconds"
    >
      <span>SOS</span>
      {status === 'holding' && (
        <div className="w-8 h-1 bg-white/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-100"
            style={{ width: `${holdProgress}%` }}
          />
        </div>
      )}
      {status === 'sent' && <span className="text-xs font-normal">SENT</span>}
    </button>
  );
}
