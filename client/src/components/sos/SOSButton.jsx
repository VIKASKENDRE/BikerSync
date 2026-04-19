import { useState, useEffect } from 'react';
import { socket } from '../../services/socket';
import { useRideContext } from '../../context/RideContext';
import { webrtcMesh } from '../../services/webrtcMesh';
import { wifiDirectMesh } from '../../services/wifiDirectMesh';
import { publishSOS } from '../../services/rtdbRide';
import { api } from '../../services/api';

export default function SOSButton() {
  const { state, dispatch } = useRideContext();
  const [status, setStatus] = useState('idle'); // idle | sent

  // Reset when SOS alert is cleared by any rider
  useEffect(() => {
    if (state.sosAlert === null && status === 'sent') setStatus('idle');
  }, [state.sosAlert]); // eslint-disable-line

  const triggerSOS = () => {
    if (status === 'sent') return;
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
        publishSOS(state.rideId, payload).catch(() => {});

        if (socket.connected) {
          socket.emit('sos:trigger', payload);
          try { await api.triggerSOS(payload); } catch {}
        } else if (webrtcMesh.activePeerCount > 0) {
          webrtcMesh.broadcastSOS(payload);
        } else if (wifiDirectMesh.peerCount > 0) {
          wifiDirectMesh.broadcastSOS(payload);
        }
        dispatch({ type: 'SOS_RECEIVED', payload });
        setStatus('sent');
      },
      () => {}
    );
  };

  return (
    <button
      onClick={triggerSOS}
      className={`w-14 h-14 rounded-full font-black text-white text-sm
                  border-2 shadow-lg select-none transition-all duration-150
                  flex flex-col items-center justify-center gap-0.5
                  ${status === 'sent'
                    ? 'bg-red-600 border-red-400 animate-pulse shadow-sos'
                    : 'bg-red-700/80 border-red-500 active:scale-110'}`}
      aria-label="SOS"
    >
      <span>SOS</span>
      {status === 'sent' && <span className="text-xs font-normal">SENT</span>}
    </button>
  );
}
