import { useRideContext } from '../../context/RideContext';
import { socket } from '../../services/socket';

export default function SOSAlert() {
  const { state, dispatch } = useRideContext();
  const { sosAlert } = state;

  if (!sosAlert) return null;

  const mapsUrl = `https://maps.google.com/?q=${sosAlert.lat},${sosAlert.lng}`;

  return (
    <div className="absolute inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-red-900/95 border-2 border-red-500 rounded-2xl p-6 mx-4 max-w-sm w-full shadow-sos">
        <div className="text-center mb-4">
          <span className="text-5xl">🚨</span>
          <h2 className="text-2xl font-black text-white mt-2">SOS ALERT</h2>
          <p className="text-red-300 text-sm mt-1">Emergency broadcast received</p>
        </div>

        <div className="bg-red-950/60 rounded-xl p-4 mb-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-red-300 text-sm">Rider</span>
            <span className="text-white font-bold">{sosAlert.displayName ?? 'Unknown'}</span>
          </div>
          {sosAlert.battery != null && (
            <div className="flex justify-between">
              <span className="text-red-300 text-sm">Battery</span>
              <span className="text-white font-bold">{sosAlert.battery}%</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-red-300 text-sm">Coordinates</span>
            <span className="text-white font-mono text-xs">
              {sosAlert.lat?.toFixed(5)}, {sosAlert.lng?.toFixed(5)}
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-3 bg-white text-black font-black text-sm rounded-xl text-center"
          >
            Open Maps
          </a>
          <button
            onClick={() => {
              socket.emit('sos:resolve'); // broadcast resolve to all riders in room
              dispatch({ type: 'SOS_DISMISS' });
            }}
            className="flex-1 py-3 bg-red-700 text-white font-bold text-sm rounded-xl"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
