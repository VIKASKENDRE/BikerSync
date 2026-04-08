import { useNavigate } from 'react-router-dom';

export default function Settings() {
  const navigate = useNavigate();
  const riderId = localStorage.getItem('bs_rider_id') ?? '—';

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 text-2xl min-w-0 min-h-0 w-10 h-10">←</button>
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </div>

      <div className="bg-surface-2 border border-surface-3 rounded-2xl divide-y divide-surface-3">
        <div className="px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Rider ID</p>
          <p className="text-sm text-white font-mono mt-1 break-all">{riderId}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider">GPS Notes</p>
          <p className="text-sm text-gray-300 mt-1">
            Keep screen on during ride. GPS requires HTTPS on iOS/Android browsers.
          </p>
        </div>
        <div className="px-5 py-4">
          <button
            onClick={() => { localStorage.clear(); navigate('/'); }}
            className="text-red-400 text-sm font-bold"
          >
            Clear local data
          </button>
        </div>
      </div>
    </div>
  );
}
