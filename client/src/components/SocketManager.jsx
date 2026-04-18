// Single mount point for ALL incoming socket events.
// This prevents duplicate listeners when components re-render.
import { useEffect } from 'react';
import { socket } from '../services/socket';
import { useRideContext } from '../context/RideContext';
import { webrtcMesh } from '../services/webrtcMesh';

export function SocketManager() {
  const { dispatch } = useRideContext();

  useEffect(() => {
    const onSnapshot  = (riders) => {
      dispatch({ type: 'RIDE_SNAPSHOT', riders });
      webrtcMesh.onSnapshot(riders);         // connect to all existing peers
    };
    const onJoined    = (rider)  => {
      dispatch({ type: 'RIDER_JOINED', rider });
      webrtcMesh.onRiderJoined(rider.riderId); // connect to new peer
    };
    const onMoved     = (update)     => dispatch({ type: 'RIDER_MOVED', update });
    const onOffline   = ({ riderId }) => {
      dispatch({ type: 'RIDER_OFFLINE', riderId });
      // Do NOT destroy the DataChannel here. The server fires rider:offline for any
      // socket drop (including a temporary network blip or hotspot data loss), but the
      // WebRTC DataChannel may still be alive over LAN. Let WebRTC manage its own
      // lifecycle: pc.onconnectionstatechange and dc.onclose already clean up when the
      // peer is truly gone. Destroying prematurely kills the P2P fallback.
    };
    const onMessage   = (message)  => dispatch({ type: 'CHAT_MESSAGE', message });
    const onSOS       = (payload)  => dispatch({ type: 'SOS_RECEIVED', payload });
    const onSOSResolve  = ()        => dispatch({ type: 'SOS_RESOLVED' });
    const onRideEnded   = ()        => dispatch({ type: 'LEAVE_RIDE' });

    // WebRTC signaling — server relays offer/answer/ICE to us
    const onWebRTCSignal = ({ from, signal }) => webrtcMesh.handleSignal(from, signal);

    socket.on('ride:snapshot', onSnapshot);
    socket.on('rider:joined',  onJoined);
    socket.on('rider:moved',   onMoved);
    socket.on('rider:offline', onOffline);
    socket.on('chat:message',  onMessage);
    socket.on('sos:broadcast', onSOS);
    socket.on('sos:resolved',  onSOSResolve);
    socket.on('ride:ended',    onRideEnded);
    socket.on('webrtc:signal', onWebRTCSignal);

    return () => {
      socket.off('ride:snapshot', onSnapshot);
      socket.off('rider:joined',  onJoined);
      socket.off('rider:moved',   onMoved);
      socket.off('rider:offline', onOffline);
      socket.off('chat:message',  onMessage);
      socket.off('sos:broadcast', onSOS);
      socket.off('sos:resolved',  onSOSResolve);
      socket.off('ride:ended',    onRideEnded);
      socket.off('webrtc:signal', onWebRTCSignal);
    };
  }, [dispatch]);

  return null;
}
