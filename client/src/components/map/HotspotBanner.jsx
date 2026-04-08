import { useState, useEffect } from 'react';
import { socket } from '../../services/socket';

export default function HotspotBanner() {
  const [online, setOnline]          = useState(navigator.onLine);
  const [sockConn, setSockConn]      = useState(socket.connected);
  const [expanded, setExpanded]      = useState(false);
  const [dismissed, setDismissed]    = useState(false);

  useEffect(() => {
    const goOnline  = () => { setOnline(true);  setDismissed(false); };
    const goOffline = () => { setOnline(false); setExpanded(false);  };
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);

    const onConnect    = () => { setSockConn(true);  setDismissed(false); };
    const onDisconnect = () => { setSockConn(false); setExpanded(false);  };
    socket.on('connect',    onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
      socket.off('connect',    onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  // Hide when connected or user dismissed for this session
  if ((online && sockConn) || dismissed) return null;

  return (
    <div className="absolute top-20 left-3 right-3 z-[1000]">
      {!expanded ? (
        /* ── Collapsed pill ── */
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5
                     bg-[#1A1A1A]/95 backdrop-blur-sm rounded-2xl
                     border border-[#FF6B00]/50 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FF6B00] animate-pulse shrink-0" />
            <span className="text-[#FF6B00] text-sm font-bold">Offline</span>
            <span className="text-gray-400 text-xs">— tap for hotspot setup</span>
          </div>
          <span className="text-gray-500 text-xs">▾</span>
        </button>
      ) : (
        /* ── Expanded guide ── */
        <div className="bg-[#1A1A1A]/95 backdrop-blur-sm rounded-2xl border border-[#FF6B00]/50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#2A2A2A]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#FF6B00] animate-pulse shrink-0" />
              <span className="text-[#FF6B00] font-bold text-sm">Hotspot Mode</span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-gray-500 text-sm px-2"
            >
              ▴
            </button>
          </div>

          {/* Steps */}
          <div className="px-4 py-3 space-y-3">
            <Step n={1} label="One rider enables mobile hotspot">
              Settings → Personal Hotspot (iOS) or Hotspot (Android) → turn on.
              Note the network name and password.
            </Step>
            <Step n={2} label="All others join that Wi-Fi network">
              Connect to the hotspot like any Wi-Fi. No internet required —
              just being on the same local network is enough.
            </Step>
            <Step n={3} label="Tracking resumes automatically">
              Once reconnected, the server sync restores within seconds.
              GPS and PTT will work as normal.
            </Step>

            <div className="mt-1 px-3 py-2 bg-[#0F0F0F] rounded-xl">
              <p className="text-gray-400 text-xs leading-relaxed">
                While offline, WebRTC P2P keeps nearby riders synced automatically.
                The P2P indicator in the top bar shows active direct links.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 px-4 pb-4">
            <button
              onClick={() => { setExpanded(false); setDismissed(true); }}
              className="flex-1 py-2.5 rounded-xl bg-[#2A2A2A] text-gray-400 text-sm font-medium
                         active:scale-95 transition-transform"
            >
              Dismiss
            </button>
            <button
              onClick={() => setExpanded(false)}
              className="flex-1 py-2.5 rounded-xl bg-[#FF6B00]/20 border border-[#FF6B00]/40
                         text-[#FF6B00] text-sm font-bold active:scale-95 transition-transform"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Step({ n, label, children }) {
  return (
    <div className="flex gap-3">
      <span className="w-6 h-6 rounded-full bg-[#FF6B00]/20 border border-[#FF6B00]/40
                       flex items-center justify-center text-[#FF6B00] text-xs font-black shrink-0 mt-0.5">
        {n}
      </span>
      <div>
        <p className="text-white text-sm font-semibold leading-snug">{label}</p>
        <p className="text-gray-400 text-xs leading-relaxed mt-0.5">{children}</p>
      </div>
    </div>
  );
}
