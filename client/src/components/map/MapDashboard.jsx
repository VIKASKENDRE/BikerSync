import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import RiderMarker from './RiderMarker';
import HotspotBanner from './HotspotBanner';
import SOSButton from '../sos/SOSButton';
import PushToTalk from '../comms/PushToTalk';
import GroupChat from '../comms/GroupChat';
import RiderList from '../ui/RiderList';
import SOSAlert from '../ui/SOSAlert';
import { useRideSession } from '../../hooks/useRideSession';
import { socket } from '../../services/socket';

// Overlay z-index — above Leaflet's max (800)
const Z = { zIndex: 1000 };

export default function MapDashboard() {
  const { riders, selfRider, unreadCount, p2pPeers, p2pConnecting, dispatch } = useRideSession();
  const navigate = useNavigate();
  const [chatOpen,       setChatOpen]       = useState(false);
  const [riderListOpen,  setRiderListOpen]  = useState(false);
  const [confirmExit,    setConfirmExit]    = useState(false);

  const openChat = () => {
    setChatOpen(true);
    dispatch({ type: 'CHAT_READ' });
  };

  const exitRide = () => {
    socket.disconnect();
    dispatch({ type: 'LEAVE_RIDE' });
    navigate('/', { replace: true });
  };

  return (
    <div className="relative w-screen h-screen bg-[#0F0F0F]">

      {/* MAP — z:0 */}
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <MapContainer
          center={[20.5937, 78.9629]}
          zoom={14}
          zoomControl={false}
          className="w-full h-full"
          style={{ background: '#0F0F0F' }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OSM &copy; CARTO'
          />
          {riders.map((rider) => (
            <RiderMarker
              key={rider.riderId}
              rider={rider}
              isSelf={rider.riderId === selfRider?.riderId}
            />
          ))}
          <AutoCenter position={selfRider?.lat ? [selfRider.lat, selfRider.lng] : null} />
        </MapContainer>
      </div>

      {/* ─── Each overlay element is positioned independently ───
          NO full-screen pointer-events:none wrapper — that breaks iOS Safari touch */}

      {/* TOP BAR — single flex row, no overlapping absolute elements */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between gap-2 px-3 pt-3 pb-2"
        style={Z}
      >
        {/* Left: rider count + P2P status + exit */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setRiderListOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-2
                       bg-[#1A1A1A]/90 backdrop-blur-sm rounded-full
                       border border-[#2A2A2A] text-white text-sm font-medium"
          >
            <span>🏍</span>
            <span>{riders.filter((r) => r.online !== false).length}</span>
          </button>

          {/* P2P status — always shown so we can debug */}
          <span className={`px-2.5 py-1 text-xs font-bold rounded-full whitespace-nowrap
            ${p2pPeers > 0
              ? 'bg-green-500/20 border border-green-500/40 text-green-400'
              : p2pConnecting > 0
                ? 'bg-yellow-500/20 border border-yellow-500/40 text-yellow-400'
                : 'bg-[#2A2A2A] border border-[#3A3A3A] text-gray-500'}`}>
            {p2pPeers > 0 ? `P2P·${p2pPeers}` : p2pConnecting > 0 ? 'P2P…' : 'P2P·0'}
          </span>

          <button
            onClick={() => setConfirmExit(true)}
            className="flex items-center gap-1 px-3 py-2
                       bg-[#1A1A1A]/90 backdrop-blur-sm rounded-full
                       border border-[#2A2A2A] text-gray-400 text-sm font-medium
                       active:scale-95 transition-transform"
            aria-label="Exit ride"
          >
            <span>✕</span>
            <span>Exit</span>
          </button>
        </div>

        {/* Center: speed / role / battery — shrinks gracefully */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 min-w-0
                     bg-[#1A1A1A]/90 backdrop-blur-sm rounded-full border border-[#2A2A2A]
                     pointer-events-none"
        >
          <span className="text-[#FFE500] font-bold text-lg tabular-nums whitespace-nowrap">
            {selfRider?.speed ?? 0}
            <span className="text-xs font-normal ml-0.5 text-gray-400">km/h</span>
          </span>
          <div className="w-px h-4 bg-[#2A2A2A] shrink-0" />
          <RoleBadge role={selfRider?.role} />
          {selfRider?.battery != null && (
            <>
              <div className="w-px h-4 bg-[#2A2A2A] shrink-0" />
              <BatteryIndicator pct={selfRider.battery} />
            </>
          )}
        </div>

        {/* Right: SOS */}
        <div className="shrink-0">
          <SOSButton />
        </div>
      </div>

      {/* HOTSPOT BANNER — offline guidance */}
      <HotspotBanner />

      {/* RIDER LIST PANEL */}
      {riderListOpen && (
        <div className="absolute top-[5.5rem] left-3 w-56" style={Z}>
          <RiderList riders={riders} onClose={() => setRiderListOpen(false)} />
        </div>
      )}

      {/* EXIT CONFIRMATION */}
      {confirmExit && (
        <div className="absolute inset-0 z-[3000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-6 mx-6 max-w-xs w-full">
            <p className="text-white font-bold text-center mb-1">Leave the ride?</p>
            <p className="text-gray-400 text-sm text-center mb-5">You'll be removed from the group.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmExit(false)}
                className="flex-1 py-3 rounded-xl bg-[#2A2A2A] text-white font-bold text-sm
                           active:scale-95 transition-transform"
              >
                Stay
              </button>
              <button
                onClick={exitRide}
                className="flex-1 py-3 rounded-xl bg-red-700 text-white font-bold text-sm
                           active:scale-95 transition-transform"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM CONTROLS */}
      <div
        className="absolute bottom-0 left-0 right-0
                   flex items-end justify-between px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]
                   bg-gradient-to-t from-[#0F0F0F] via-[#0F0F0F]/70 to-transparent"
        style={Z}
      >
        <PushToTalk />

        <button
          className="w-14 h-14 rounded-full bg-[#1A1A1A] border border-[#2A2A2A]
                     flex items-center justify-center text-2xl text-white
                     active:scale-95 transition-transform"
          aria-label="Center map"
        >
          ◎
        </button>

        <button
          onClick={() => chatOpen ? setChatOpen(false) : openChat()}
          className="relative w-14 h-14 rounded-full bg-[#1A1A1A] border border-[#2A2A2A]
                     flex items-center justify-center text-2xl
                     active:scale-95 transition-transform"
          aria-label="Group chat"
        >
          💬
          {!chatOpen && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1
                             bg-red-500 rounded-full flex items-center justify-center
                             text-white text-xs font-black leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* CHAT DRAWER */}
      {chatOpen && (
        <div className="absolute bottom-28 left-4 right-4" style={Z}>
          <GroupChat onClose={() => setChatOpen(false)} />
        </div>
      )}

      {/* SOS ALERT — full-screen modal */}
      <SOSAlert />
    </div>
  );
}

function AutoCenter({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position?.[0] != null) map.panTo(position, { animate: true, duration: 0.5 });
  }, [position?.[0], position?.[1]]);
  return null;
}

function RoleBadge({ role }) {
  const styles = {
    lead:  'bg-[#FFE500]/20 text-[#FFE500] border-[#FFE500]/40',
    sweep: 'bg-[#FF6B00]/20 text-[#FF6B00] border-[#FF6B00]/40',
    rider: 'bg-white/10 text-gray-300 border-white/20',
  };
  const labels = { lead: 'LEAD', sweep: 'SWEEP', rider: 'RIDER' };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border tracking-wider ${styles[role] ?? styles.rider}`}>
      {labels[role] ?? 'RIDER'}
    </span>
  );
}

function BatteryIndicator({ pct }) {
  const color = pct > 50 ? 'text-green-400' : pct > 20 ? 'text-[#FFE500]' : 'text-red-400';
  return <span className={`text-xs font-bold ${color}`}>🔋{pct}%</span>;
}
