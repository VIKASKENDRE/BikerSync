import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { wifiDirectMesh } from '../../services/wifiDirectMesh';
import { enterPiP, onPiPChange } from '../../services/pip';
import { deleteRide } from '../../services/rtdbRide';
import RiderMarker from './RiderMarker';
import RouteLayer from './RouteLayer';
import TrailLayer from './TrailLayer';
import SOSButton from '../sos/SOSButton';
import PushToTalk from '../comms/PushToTalk';
import GroupChat from '../comms/GroupChat';
import RiderList from '../ui/RiderList';
import SOSAlert from '../ui/SOSAlert';
import { useRideSession } from '../../hooks/useRideSession';
import { socket } from '../../services/socket';

const Z_UI   = { zIndex: 1000 };
const Z_OVER = { zIndex: 2000 };
const Z_TOP  = { zIndex: 3000 };

function MapController({ selfRider, mapRef }) {
  const map = useMap();
  useEffect(() => { mapRef.current = map; }, [map]); // eslint-disable-line
  useEffect(() => {
    if (selfRider?.lat) map.panTo([selfRider.lat, selfRider.lng]);
  }, [selfRider?.lat, selfRider?.lng]); // eslint-disable-line
  return null;
}


export default function MapDashboard() {
  const {
    riders, selfRider, unreadCount, messages,
    p2pPeers, p2pConnecting, wdPeers,
    rideId, sharedRoute, trails, dispatch,
  } = useRideSession();
  const navigate    = useNavigate();
  const mapRef      = useRef(null);

  const [chatOpen,      setChatOpen]      = useState(false);
  const [riderListOpen, setRiderListOpen] = useState(false);
  const [confirmExit,   setConfirmExit]   = useState(false);
  const [rideCopied,    setRideCopied]    = useState(false);
  const [wdModalOpen,   setWdModalOpen]   = useState(false);
  const [wdCopied,      setWdCopied]      = useState(''); // 'ssid' | 'pass' | ''
  const [wdGroupSsid,   setWdGroupSsid]   = useState(() => wifiDirectMesh.groupSsid);
  const [wdGroupPass,   setWdGroupPass]   = useState(() => wifiDirectMesh.groupPassphrase);
  const [isPiP,         setIsPiP]         = useState(false);
  // Track whether Google Maps navigation is already running.
  // If true, tapping Navigate again just re-enters PiP without opening a new intent
  // (which would interrupt the ongoing turn-by-turn navigation).
  const [isNavigating,  setIsNavigating]  = useState(false);
  const prevMsgCount = useRef(messages?.length ?? 0);

  useEffect(() => {
    wifiDirectMesh.onGroupReady = (ssid, pass) => { setWdGroupSsid(ssid); setWdGroupPass(pass); };
    return () => { wifiDirectMesh.onGroupReady = null; };
  }, []);

  useEffect(() => {
    if (rideId && selfRider?.role !== 'lead' && !wdGroupSsid) {
      setWdGroupSsid(`DIRECT-BikerSync-${rideId.slice(0, 4)}`);
      setWdGroupPass(`bsync${rideId}`.padEnd(8, '0').slice(0, 32));
    }
  }, [rideId, selfRider?.role]);

  // Play a soft chime when a message from another rider arrives
  useEffect(() => {
    const count = messages?.length ?? 0;
    if (count > prevMsgCount.current) {
      const last = messages[count - 1];
      if (last?.riderId !== selfRider?.riderId) playChime();
    }
    prevMsgCount.current = count;
  }, [messages]); // eslint-disable-line

  // Subscribe to PiP mode changes from the native layer
  useEffect(() => {
    const handle = onPiPChange(({ active }) => setIsPiP(active));
    return () => handle?.remove?.();
  }, []);

  const copyRideId = async () => {
    try { await navigator.clipboard.writeText(rideId ?? ''); } catch {}
    setRideCopied(true);
    setTimeout(() => setRideCopied(false), 2000);
  };

  const copyWd = async (text, key) => {
    try { await navigator.clipboard.writeText(text); } catch {}
    setWdCopied(key);
    setTimeout(() => setWdCopied(''), 2000);
  };

  const recenter = () => {
    if (selfRider?.lat && mapRef.current)
      mapRef.current.setView([selfRider.lat, selfRider.lng], 16);
  };

  const openChat = () => { setChatOpen(true); dispatch({ type: 'CHAT_READ' }); };

  /** Normal leave — just this rider exits. */
  const exitRide = () => {
    setIsNavigating(false);
    socket.disconnect();
    dispatch({ type: 'LEAVE_RIDE' });
    navigate('/', { replace: true });
  };

  /** LEAD only — ends the ride for everyone by deleting RTDB data. */
  const endRideForAll = async () => {
    setIsNavigating(false);
    socket.emit('ride:end', { rideId });
    await deleteRide(rideId).catch(() => {});
    socket.disconnect();
    dispatch({ type: 'LEAVE_RIDE' });
    navigate('/', { replace: true });
  };

  /**
   * Navigate button:
   * - First tap: enters PiP + opens Google Maps navigation from current position.
   * - Subsequent taps while navigation is active: just re-enters PiP so the user
   *   returns to the floating window WITHOUT firing a new Maps intent (which would
   *   ask "exit navigation?").
   */
  const handleNavigate = async () => {
    if (isNavigating) {
      // Maps is already navigating — just float back over it
      await enterPiP();
      return;
    }
    setIsNavigating(true);
    await enterPiP();
    await new Promise((r) => setTimeout(r, 120));
    const origin = selfRider?.lat ? `${selfRider.lat},${selfRider.lng}` : '';
    const url = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&travelmode=driving`
      : `https://www.google.com/maps/`;
    window.open(url, '_system');
  };

  const stopNavigation = () => setIsNavigating(false);

  const initialCenter = selfRider?.lat
    ? [selfRider.lat, selfRider.lng]
    : [20.5937, 78.9629];

  return (
    <div className="relative w-screen h-dvh bg-[#1a1a1a]">

      {/* ── MAP ─────────────────────────────────────────────────────── */}
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <MapContainer
          center={initialCenter}
          zoom={15}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={19}
          />
          <MapController selfRider={selfRider} mapRef={mapRef} />
          {riders.map((rider) => (
            <RiderMarker
              key={rider.riderId}
              rider={rider}
              isSelf={rider.riderId === selfRider?.riderId}
            />
          ))}
          <TrailLayer trails={trails} riders={riders} selfId={selfRider?.riderId} />
          <RouteLayer route={sharedRoute} />
        </MapContainer>
      </div>

      {/* ── All overlay UI — hidden when floating in PiP ────────────── */}
      {!isPiP && (
        <>
          {/* ── TOP BAR ───────────────────────────────────────────────── */}
          <div
            className="absolute top-0 left-0 right-0 flex flex-col gap-1.5 px-3
                       pt-[max(0.75rem,env(safe-area-inset-top))] pb-2"
            style={Z_UI}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setRiderListOpen((o) => !o)}
                  className="flex items-center gap-1.5 px-3 py-2
                             bg-[#1A1A1A]/90 backdrop-blur-sm rounded-full
                             border border-[#2A2A2A] text-white text-sm font-medium
                             active:scale-95 transition-transform"
                >
                  <span>🏍</span>
                  <span>{riders.filter((r) => r.online !== false).length}</span>
                </button>

                <button
                  onClick={() => setConfirmExit(true)}
                  className="flex items-center gap-1.5 px-3 py-2
                             bg-[#1A1A1A]/90 backdrop-blur-sm rounded-full
                             border border-[#2A2A2A] text-gray-400 text-sm font-medium
                             active:scale-95 transition-transform"
                >
                  <span>✕</span>
                  <span>Exit</span>
                </button>

                {(p2pPeers > 0 || p2pConnecting > 0) && (
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-full whitespace-nowrap
                    ${p2pPeers > 0
                      ? 'bg-green-500/20 border border-green-500/40 text-green-400'
                      : 'bg-yellow-500/20 border border-yellow-500/40 text-yellow-400'}`}>
                    {p2pPeers > 0 ? `P2P·${p2pPeers}` : 'P2P…'}
                  </span>
                )}

                {/* Wi-Di pill — always visible; orange = waiting, blue = connected */}
                <button
                  onClick={() => setWdModalOpen(true)}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full
                              whitespace-nowrap active:scale-95 transition-transform
                              ${wdPeers > 0
                                ? 'bg-blue-500/20 border border-blue-500/40 text-blue-400'
                                : 'bg-[#FF6B00]/20 border border-[#FF6B00]/40 text-[#FF6B00]'}`}
                >
                  <span>📡</span>
                  <span>{wdPeers > 0 ? `Wi-Di·${wdPeers}` : 'Wi-Di'}</span>
                </button>
              </div>

              <div className="shrink-0"><SOSButton /></div>
            </div>

            {/* Row 2: speed HUD + Ride ID */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5
                              bg-[#1A1A1A]/90 backdrop-blur-sm rounded-full border border-[#2A2A2A]
                              pointer-events-none">
                <span className="text-[#FFE500] font-bold text-base tabular-nums whitespace-nowrap">
                  {selfRider?.speed ?? 0}
                  <span className="text-xs font-normal ml-0.5 text-gray-400">km/h</span>
                </span>
                <div className="w-px h-3.5 bg-[#2A2A2A] shrink-0" />
                <RoleBadge role={selfRider?.role} />
                {selfRider?.battery != null && (
                  <>
                    <div className="w-px h-3.5 bg-[#2A2A2A] shrink-0" />
                    <BatteryIndicator pct={selfRider.battery} />
                  </>
                )}
              </div>

              {rideId && (
                <button
                  onClick={copyRideId}
                  className="flex items-center gap-1.5 px-3 py-1.5
                             bg-[#1A1A1A]/90 backdrop-blur-sm rounded-full border border-[#2A2A2A]
                             active:scale-95 transition-transform"
                >
                  <span className="text-gray-500 text-xs">ID</span>
                  <span className="text-[#FFE500] font-mono font-black text-xs tracking-widest">
                    {rideCopied ? '✓ Copied' : rideId}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* ── WI-DI MODAL ───────────────────────────────────────────── */}
          {wdModalOpen && (
            <div
              className="absolute inset-0 flex items-end justify-center bg-black/50 backdrop-blur-sm"
              style={Z_TOP}
              onClick={() => setWdModalOpen(false)}
            >
              <div
                className="w-full max-w-sm mx-3 mb-6 bg-[#1A1A1A] border rounded-3xl overflow-hidden
                           shadow-2xl"
                style={{ borderColor: wdPeers > 0 ? 'rgba(59,130,246,0.4)' : 'rgba(255,107,0,0.4)' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A]">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0
                      ${wdPeers > 0 ? 'bg-blue-400' : 'bg-[#FF6B00] animate-pulse'}`} />
                    <span className={`font-bold text-sm
                      ${wdPeers > 0 ? 'text-blue-300' : 'text-[#FF6B00]'}`}>
                      {wdPeers > 0
                        ? `WiFi Direct · ${wdPeers} rider${wdPeers !== 1 ? 's' : ''} connected`
                        : 'WiFi Direct · waiting for riders'}
                    </span>
                  </div>
                  <button
                    onClick={() => setWdModalOpen(false)}
                    className="w-7 h-7 flex items-center justify-center rounded-full
                               bg-[#2A2A2A] text-gray-400 text-sm active:scale-90 transition-transform"
                  >✕</button>
                </div>

                {/* Credentials */}
                {wdGroupSsid && (
                  <div className="px-5 py-4 space-y-3">
                    <p className="text-gray-400 text-xs">
                      {selfRider?.role === 'lead'
                        ? 'Tell riders to connect to this WiFi network:'
                        : 'Connect to this WiFi network (Settings → WiFi):'}
                    </p>

                    <div className="flex items-center justify-between bg-black/40 rounded-2xl px-4 py-3">
                      <div>
                        <span className="text-gray-500 text-xs block mb-0.5">Network name</span>
                        <span className="text-white font-mono font-bold text-sm">{wdGroupSsid}</span>
                      </div>
                      <button
                        onClick={() => copyWd(wdGroupSsid, 'ssid')}
                        className="ml-3 px-3 py-1.5 bg-white/10 rounded-xl text-xs text-gray-300
                                   active:scale-95 transition-transform shrink-0"
                      >{wdCopied === 'ssid' ? '✓' : 'Copy'}</button>
                    </div>

                    {wdGroupPass && (
                      <div className="flex items-center justify-between bg-black/40 rounded-2xl px-4 py-3">
                        <div>
                          <span className="text-gray-500 text-xs block mb-0.5">Password</span>
                          <span className="text-white font-mono font-bold text-sm">{wdGroupPass}</span>
                        </div>
                        <button
                          onClick={() => copyWd(wdGroupPass, 'pass')}
                          className="ml-3 px-3 py-1.5 bg-white/10 rounded-xl text-xs text-gray-300
                                     active:scale-95 transition-transform shrink-0"
                        >{wdCopied === 'pass' ? '✓' : 'Copy'}</button>
                      </div>
                    )}

                    {selfRider?.role !== 'lead' && (
                      <p className="text-gray-500 text-xs">
                        After connecting, the app links automatically.
                      </p>
                    )}
                  </div>
                )}

                {!wdGroupSsid && (
                  <p className="px-5 py-4 text-gray-500 text-sm">
                    WiFi Direct group not ready yet — stay on this screen.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── RIDER LIST ────────────────────────────────────────────── */}
          {riderListOpen && (
            <div className="absolute top-[5.5rem] left-3 w-56" style={Z_UI}>
              <RiderList
                riders={riders}
                selfRider={selfRider}
                onAssignLead={(targetRiderId) => socket.emit('role:assign', { targetRiderId })}
                onClose={() => setRiderListOpen(false)}
              />
            </div>
          )}

          {/* ── EXIT DIALOG ───────────────────────────────────────────── */}
          {confirmExit && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6"
                 style={Z_TOP}>
              <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-6 w-full max-w-xs">
                <p className="text-white font-bold text-center mb-1">
                  {selfRider?.role === 'lead' ? 'Leave or end the ride?' : 'Leave the ride?'}
                </p>
                <p className="text-gray-400 text-sm text-center mb-5">
                  {selfRider?.role === 'lead'
                    ? 'You can leave (another rider becomes Lead) or end the ride for everyone.'
                    : 'You\'ll be removed from the group.'}
                </p>
                <div className="flex flex-col gap-2">
                  {selfRider?.role === 'lead' && (
                    <button
                      onClick={endRideForAll}
                      className="w-full py-3.5 rounded-xl bg-red-900 border border-red-700
                                 text-red-300 font-bold text-sm active:scale-95 transition-transform"
                    >
                      🏁 End Ride for Everyone
                    </button>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmExit(false)}
                      className="flex-1 py-3.5 rounded-xl bg-[#2A2A2A] text-white font-bold text-sm
                                 active:scale-95 transition-transform"
                    >Stay</button>
                    <button
                      onClick={exitRide}
                      className="flex-1 py-3.5 rounded-xl bg-red-700 text-white font-bold text-sm
                                 active:scale-95 transition-transform"
                    >
                      {selfRider?.role === 'lead' ? 'Just Leave' : 'Leave'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── BOTTOM CONTROLS ───────────────────────────────────────── */}
          {!chatOpen && (
            <div
              className="absolute bottom-0 left-0 right-0
                         flex items-end justify-between px-5 pt-8
                         pb-[max(1.5rem,env(safe-area-inset-bottom))]
                         bg-gradient-to-t from-[#0F0F0F]/80 via-[#0F0F0F]/40 to-transparent
                         pointer-events-none"
              style={Z_UI}
            >
              <div className="pointer-events-auto"><PushToTalk /></div>

              <div className="flex flex-col items-center gap-3 pointer-events-auto">
                {/* Navigate row: [stop] + [go-to-Maps] side by side when navigating */}
                <div className="flex items-center gap-2">
                  {/* Stop navigation — only visible while navigating */}
                  {isNavigating && (
                    <button
                      onClick={stopNavigation}
                      className="w-10 h-10 rounded-full bg-red-700 border border-red-500/60
                                 flex items-center justify-center text-white text-sm font-black
                                 active:scale-95 transition-transform shadow-lg"
                      aria-label="Stop navigation"
                    >✕</button>
                  )}
                  {/* Navigate / return-to-Maps */}
                  <button
                    onClick={handleNavigate}
                    className={`w-12 h-12 rounded-full flex items-center justify-center
                               active:scale-95 transition-transform shadow-lg
                               ${isNavigating
                                 ? 'bg-[#4285F4] border-2 border-white/50'
                                 : 'bg-[#4285F4] border border-[#4285F4]/60'}`}
                    aria-label={isNavigating ? 'Return to Google Maps navigation' : 'Navigate with Google Maps'}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                  </button>
                </div>

                <button
                  onClick={openChat}
                  className="relative w-12 h-12 rounded-full bg-[#1A1A1A] border border-[#2A2A2A]
                             flex items-center justify-center text-xl
                             active:scale-95 transition-transform shadow-lg"
                  aria-label="Group chat"
                >
                  💬
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1
                                     bg-red-500 rounded-full flex items-center justify-center
                                     text-white text-xs font-black leading-none">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={recenter}
                  className="w-12 h-12 rounded-full bg-[#1A1A1A] border border-[#2A2A2A]
                             flex items-center justify-center text-xl text-white
                             active:scale-95 transition-transform shadow-lg"
                  aria-label="Center map"
                >◎</button>
              </div>
            </div>
          )}

          {/* ── CHAT ──────────────────────────────────────────────────── */}
          {chatOpen && (
            <div
              className="absolute bottom-0 left-0 right-0"
              style={{ ...Z_OVER, paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <GroupChat onClose={() => setChatOpen(false)} />
            </div>
          )}

          {/* ── SOS ALERT ─────────────────────────────────────────────── */}
          <SOSAlert />
        </>
      )}

    </div>
  );
}

function playChime() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch {}
}

function RoleBadge({ role }) {
  const styles = {
    lead:  'bg-[#FFE500]/20 text-[#FFE500] border-[#FFE500]/40',
    sweep: 'bg-[#FF6B00]/20 text-[#FF6B00] border-[#FF6B00]/40',
    rider: 'bg-white/10 text-gray-300 border-white/20',
  };
  const labels = { lead: 'LEAD', sweep: 'SWEEP', rider: 'RIDER' };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border tracking-wider whitespace-nowrap
                      ${styles[role] ?? styles.rider}`}>
      {labels[role] ?? 'RIDER'}
    </span>
  );
}

function BatteryIndicator({ pct }) {
  const color = pct > 50 ? 'text-green-400' : pct > 20 ? 'text-[#FFE500]' : 'text-red-400';
  return <span className={`text-xs font-bold whitespace-nowrap ${color}`}>🔋{pct}%</span>;
}
