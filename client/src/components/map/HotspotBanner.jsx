import { useState, useEffect } from 'react';
import { socket } from '../../services/socket';

/**
 * Shown when the server socket is disconnected (offline).
 * Displays WiFi Direct group credentials so riders can connect.
 *
 * Props:
 *   wdPeers        — number of WiFi Direct TCP peers connected
 *   wdGroupSsid    — WiFi Direct group SSID (set after LEAD creates group)
 *   wdGroupPass    — WiFi Direct group passphrase
 *   isLead         — whether this device is the ride LEAD
 */
export default function HotspotBanner({ wdPeers = 0, wdGroupSsid = '', wdGroupPass = '', isLead = false }) {
  const [sockConn,  setSockConn]  = useState(socket.connected);
  const [dismissed, setDismissed] = useState(false);
  const [copied,    setCopied]    = useState('');   // 'ssid' | 'pass' | ''

  useEffect(() => {
    const onConnect    = () => { setSockConn(true);  setDismissed(false); };
    const onDisconnect = () => setSockConn(false);
    socket.on('connect',    onConnect);
    socket.on('disconnect', onDisconnect);
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); };
  }, []);

  // Re-show when WD connection state changes
  useEffect(() => { setDismissed(false); }, [wdPeers]);

  if (sockConn || dismissed) return null;

  const hasWD    = wdPeers > 0;
  const hasGroup = Boolean(wdGroupSsid);

  const copy = async (text, key) => {
    try { await navigator.clipboard.writeText(text); } catch {}
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="absolute top-20 left-3 right-3 z-[1000]">
      <div className={`rounded-2xl border backdrop-blur-sm overflow-hidden
                       ${hasWD ? 'bg-blue-900/85 border-blue-500/50'
                               : 'bg-[#1A1A1A]/95 border-[#FF6B00]/50'}`}>

        {/* Status row */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0
                              ${hasWD ? 'bg-blue-400' : 'bg-[#FF6B00] animate-pulse'}`} />
            {hasWD ? (
              <span className="text-blue-300 text-sm font-bold">
                WiFi Direct · {wdPeers} rider{wdPeers !== 1 ? 's' : ''} connected
              </span>
            ) : (
              <span className="text-[#FF6B00] text-sm font-bold">
                Offline
                <span className="text-gray-400 font-normal">
                  {hasGroup ? ' · share WiFi Direct below' : ' · no direct link yet'}
                </span>
              </span>
            )}
          </div>
          <button onClick={() => setDismissed(true)}
                  className="text-gray-500 text-sm px-1 shrink-0">✕</button>
        </div>

        {/* WiFi Direct credentials — show when group is ready */}
        {hasGroup && (
          <div className="px-4 pb-3 space-y-2 border-t border-white/10 pt-3">
            <p className="text-gray-400 text-xs">
              {isLead
                ? 'Tell riders to connect to this WiFi network:'
                : 'Connect to this WiFi network (Settings → WiFi):'}
            </p>

            {/* SSID row */}
            <div className="flex items-center justify-between bg-black/30 rounded-xl px-3 py-2">
              <div>
                <span className="text-gray-500 text-xs block">Network name</span>
                <span className="text-white font-mono font-bold text-sm">{wdGroupSsid}</span>
              </div>
              <button
                onClick={() => copy(wdGroupSsid, 'ssid')}
                className="ml-2 px-2.5 py-1 bg-white/10 rounded-lg text-xs text-gray-300
                           active:scale-95 transition-transform shrink-0"
              >
                {copied === 'ssid' ? '✓' : 'Copy'}
              </button>
            </div>

            {/* Passphrase row */}
            {wdGroupPass && (
              <div className="flex items-center justify-between bg-black/30 rounded-xl px-3 py-2">
                <div>
                  <span className="text-gray-500 text-xs block">Password</span>
                  <span className="text-white font-mono font-bold text-sm">{wdGroupPass}</span>
                </div>
                <button
                  onClick={() => copy(wdGroupPass, 'pass')}
                  className="ml-2 px-2.5 py-1 bg-white/10 rounded-lg text-xs text-gray-300
                             active:scale-95 transition-transform shrink-0"
                >
                  {copied === 'pass' ? '✓' : 'Copy'}
                </button>
              </div>
            )}

            {!isLead && (
              <p className="text-gray-500 text-xs">
                After connecting, the app links automatically.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
