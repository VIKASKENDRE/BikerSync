import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRideContext } from '../context/RideContext';
import { socket } from '../services/socket';
import MapDashboard from '../components/map/MapDashboard';

export default function Ride() {
  const { rideId } = useParams();
  const { state } = useRideContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!state.rideId || !state.selfRider) {
      // No session — send back to home with the ride ID pre-filled
      navigate(`/?join=${rideId}`, { replace: true });
      return;
    }

    const payload = {
      rideId:      state.rideId,
      riderId:     state.selfRider.riderId,
      role:        state.selfRider.role,
      displayName: state.selfRider.displayName,
    };

    // Re-emit ride:join on every (re)connection so socket.data is always set.
    // This handles: normal flow, page refresh, Railway restart, brief network drop.
    const rejoin = () => socket.emit('ride:join', payload);

    socket.on('connect', rejoin);

    if (socket.connected) {
      // Already connected (normal Home → Ride flow) — join immediately
      rejoin();
    } else {
      // Not connected (page refresh, or first load) — connect then rejoin via listener
      socket.connect();
    }

    return () => socket.off('connect', rejoin);
  }, [state.rideId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state.rideId) return null;

  return <MapDashboard />;
}
