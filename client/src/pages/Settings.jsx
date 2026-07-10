import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor, registerPlugin } from '@capacitor/core';

const BgLocation = Capacitor.isNativePlatform() ? registerPlugin('BackgroundLocation') : null;

export default function Settings() {
  const navigate = useNavigate();
  const riderId = localStorage.getItem('bs_rider_id') ?? '—';

  const [crashDetection, setCrashDetection] = useState(
    () => localStorage.getItem('bs_crash_detection') !== 'off',
  );

  const toggleCrashDetection = () => {
    const next = !crashDetection;
    setCrashDetection(next);
    localStorage.setItem('bs_crash_detection', next ? 'on' : 'off');
    BgLocation?.setCrashDetection({ enabled: next }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 text-2xl min-w-0 min-h-0 w-10 h-10">←</button>
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </div>

      <div className="bg-surface-2 border border-surface-3 rounded-2xl divide-y divide-surface-3">
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Crash Detection</p>
            <p className="text-sm text-gray-300 mt-1">
              Detects a hard impact followed by no movement and auto-sends SOS
              to your group after a 30&nbsp;s "Are you OK?" countdown.
            </p>
          </div>
          <button
            onClick={toggleCrashDetection}
            role="switch"
            aria-checked={crashDetection}
            className={`shrink-0 w-14 h-8 rounded-full transition-colors relative
              ${crashDetection ? 'bg-[#FFE500]' : 'bg-surface-3'}`}
          >
            <span
              className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all
                ${crashDetection ? 'left-7' : 'left-1'}`}
            />
          </button>
        </div>
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
