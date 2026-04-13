import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import RiderMarker from './RiderMarker';
import RouteLayer from './RouteLayer';
import TrailLayer from './TrailLayer';
import NavigationPanel from './NavigationPanel';
import HotspotBanner from './HotspotBanner';
import SOSButton from '../sos/SOSButton';
import PushToTalk from '../comms/PushToTalk';
import GroupChat from '../comms/GroupChat';
import RiderList from '../ui/RiderList';
import SOSAlert from '../ui/SOSAlert';
import { useRideSession } from '../../hooks/useRideSession';
import { socket } from '../../services/socket';
import { LIBRARIES, MAP_OPTIONS } from '../../services/googleMaps';

const Z = { zIndex: 1000 };

export default function MapDashboard() {
  const { riders, selfRider, unreadCount, p2pPeers, p2pConnecting, wdPeers, sharedRoute, trails, dispatch } = useRideSession();
  const navigate = useNavigate();
  const mapRef   = useRef(null);

  const [chatOpen,      setChatOpen]      = useState(false);
  const [riderListOpen, setRiderListOpen] = useState(false);
  const [confirmExit,   setConfirmExit]   = useState(false);
  const [navOpen,    setNavOpen]    = useState(false);
  const [localRoute, setLocalRoute] = useState(null); // { polyline, steps, distance, duration, destination }

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
    libraries:        LIBRARIES,
  });

  const onMapLoad = useCallback((map) => { mapRef.current = map; }, []);

  // Auto-pan to self position on GPS update
  useEffect(() => {
    if (selfRider?.lat && mapRef.current) {
      mapRef.current.panTo({ lat: selfRider.lat, lng: selfRider.lng });
    }
  }, [selfRider?.lat, selfRider?.lng]);

  const recenter = () => {
    if (selfRider?.lat && mapRef.current) {
      mapRef.current.panTo({ lat: selfRider.lat, lng: selfRider.lng });
      mapRef.current.setZoom(16);
    }
  };

  const openChat = () => {
    setChatOpen(true);
    setNavOpen(false);
    dispatch({ type: 'CHAT_READ' });
  };

  const exitRide = () => {
    socket.disconnect();
    dispatch({ type: 'LEAVE_RIDE' });
    navigate('/', { replace: true });
  };

  if (loadError) {
    return (
      <div className="w-screen h-dvh bg-[#0F0F0F] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-red-400 font-bold mb-2">Map failed to load</p>
          <p className="text-gray-400 text-sm">Check that VITE_GOOGLE_MAPS_API_KEY is set and the Maps JavaScript API is enabled.</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-screen h-dvh bg-[#0F0F0F] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#FFE500] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading map…</p>
        </div>
      </div>
    );
  }

  const initialCenter = selfRider?.lat
    ? { lat: selfRider.lat, lng: selfRider.lng }
    : { lat: 20.5937, lng: 78.9629 };

  return (
    <div className="relative w-screen h-dvh bg-[#1a1a1a]">

      {/* MAP */}
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={initialCenter}
          zoom={15}
          options={MAP_OPTIONS}
          onLoad={onMapLoad}
        >
          {riders.map((rider) => (
            <RiderMarker
              key={rider.riderId}
              rider={rider}
              isSelf={rider.riderId === selfRider?.riderId}
            />
          ))}
          <TrailLayer trails={trails} riders={riders} selfId={selfRider?.riderId} />
          <RouteLayer route={localRoute ?? sharedRoute} mapRef={mapRef} />
        </GoogleMap>
      </div>

      {/* TOP BAR */}
      <div
        className="absolute top-0 left-0 right-0 flex flex-col gap-1.5 px-3
                   pt-[max(0.75rem,env(safe-area-inset-top))] pb-2"
        style={Z}
      >
        {/* Row 1: riders + exit | SOS */}
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

            {/* WebRTC P2P pill */}
            {(p2pPeers > 0 || p2pConnecting > 0) && (
              <span className={`px-2.5 py-1 text-xs font-bold rounded-full whitespace-nowrap
                ${p2pPeers > 0
                  ? 'bg-green-500/20 border border-green-500/40 text-green-400'
                  : 'bg-yellow-500/20 border border-yellow-500/40 text-yellow-400'}`}>
                {p2pPeers > 0 ? `P2P·${p2pPeers}` : 'P2P…'}
              </span>
            )}

            {/* WiFi Direct pill — shown only in APK when WD peers are connected */}
            {wdPeers > 0 && (
              <span className="px-2.5 py-1 text-xs font-bold rounded-full whitespace-nowrap
                bg-blue-500/20 border border-blue-500/40 text-blue-400">
                WD·{wdPeers}
              </span>
            )}
          </div>

          <div className="shrink-0"><SOSButton /></div>
        </div>

        {/* Row 2: HUD */}
        <div className="flex items-center gap-2 self-start px-3 py-1.5
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
      </div>

      {/* OFFLINE BANNER */}
      <HotspotBanner />

      {/* RIDER LIST */}
      {riderListOpen && (
        <div className="absolute top-[5.5rem] left-3 w-56" style={Z}>
          <RiderList
            riders={riders}
            selfRider={selfRider}
            onAssignLead={(targetRiderId) => socket.emit('role:assign', { targetRiderId })}
            onClose={() => setRiderListOpen(false)}
          />
        </div>
      )}

      {/* EXIT CONFIRMATION */}
      {confirmExit && (
        <div className="absolute inset-0 z-[3000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-6 w-full max-w-xs">
            <p className="text-white font-bold text-center mb-1">Leave the ride?</p>
            <p className="text-gray-400 text-sm text-center mb-5">You'll be removed from the group.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmExit(false)}
                className="flex-1 py-3.5 rounded-xl bg-[#2A2A2A] text-white font-bold text-sm
                           active:scale-95 transition-transform"
              >Stay</button>
              <button
                onClick={exitRide}
                className="flex-1 py-3.5 rounded-xl bg-red-700 text-white font-bold text-sm
                           active:scale-95 transition-transform"
              >Leave</button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM CONTROLS */}
      {!chatOpen && (
        <div
          className="absolute bottom-0 left-0 right-0
                     flex items-end justify-between px-5 pt-6
                     pb-[max(1.25rem,env(safe-area-inset-bottom))]
                     bg-gradient-to-t from-[#0F0F0F] via-[#0F0F0F]/60 to-transparent"
          style={Z}
        >
          <PushToTalk />

          <button
            onClick={recenter}
            className="w-12 h-12 rounded-full bg-[#1A1A1A] border border-[#2A2A2A]
                       flex items-center justify-center text-xl text-white
                       active:scale-95 transition-transform shadow-lg"
            aria-label="Center map"
          >◎</button>

          <button
            onClick={() => setNavOpen((o) => !o)}
            className={`w-12 h-12 rounded-full border flex items-center justify-center text-xl
                       active:scale-95 transition-transform shadow-lg
                       ${localRoute || sharedRoute
                         ? 'bg-[#4A90E2]/20 border-[#4A90E2]/60 text-[#4A90E2]'
                         : 'bg-[#1A1A1A] border-[#2A2A2A] text-white'}`}
            aria-label="Navigation"
          >🗺</button>

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
        </div>
      )}

      {/* CHAT */}
      {chatOpen && (
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{ ...Z, paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <GroupChat onClose={() => setChatOpen(false)} />
        </div>
      )}

      {/* NAVIGATION */}
      <NavigationPanel
        open={navOpen}
        onClose={() => setNavOpen(false)}
        selfRider={selfRider}
        isLead={selfRider?.role === 'lead'}
        route={localRoute}
        onRoute={setLocalRoute}
      />

      {/* SOS ALERT */}
      <SOSAlert />
    </div>
  );
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
