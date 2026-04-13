import { useState, useEffect, useRef } from 'react';
import { socket } from '../../services/socket';
import { haversineMeters, formatDistance, formatDuration, maneuverIcon } from '../../services/routing';

const API         = `${import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000'}/api/maps`;
const STEP_ADVANCE = 40; // metres
const stripHtml    = (h) => h?.replace(/<[^>]*>/g, '') ?? '';

export default function NavigationPanel({ open, onClose, selfRider, isLead, route, onRoute }) {
  const [query,       setQuery]       = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [routing,     setRouting]     = useState(false);
  const [error,       setError]       = useState('');
  const [navigating,  setNavigating]  = useState(false);
  const [stepIdx,     setStepIdx]     = useState(0);
  const [shared,      setShared]      = useState(false);
  const [fallback,    setFallback]    = useState(false); // server in OSM fallback mode
  const inputRef    = useRef(null);
  const debounceRef = useRef(null);

  // Focus input when panel opens
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 120); }, [open]);

  // Reset nav state when route is cleared
  useEffect(() => { if (!route) { setNavigating(false); setStepIdx(0); setShared(false); } }, [route]);

  // Auto-advance turn-by-turn step
  useEffect(() => {
    if (!navigating || !route?.steps || !selfRider?.lat) return;
    const steps = route.steps;
    if (stepIdx >= steps.length - 1) return;
    const next = steps[stepIdx + 1];
    if (haversineMeters(selfRider.lat, selfRider.lng, next.lat, next.lng) < STEP_ADVANCE) {
      setStepIdx((i) => i + 1);
    }
  }, [selfRider?.lat, selfRider?.lng]);

  // Debounced autocomplete via server proxy
  const handleQuery = (val) => {
    setQuery(val);
    setSuggestions([]);
    setError('');
    clearTimeout(debounceRef.current);
    if (val.trim().length < 2) return;
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await fetch(`${API}/autocomplete?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
        if (data.fallbackMode) setFallback(true);
      } catch { setError('Search unavailable'); }
      finally   { setSearching(false); }
    }, 350);
  };

  const selectSuggestion = async (s) => {
    setSuggestions([]);
    setQuery(s.main_text);
    setError('');

    // Nominatim fallback result already has coordinates
    if (s._lat != null) {
      return getRoute({ lat: s._lat, lng: s._lng });
    }

    // Resolve place_id → coordinates via server proxy
    try {
      const res  = await fetch(`${API}/details?placeId=${encodeURIComponent(s.place_id)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      getRoute({ lat: data.lat, lng: data.lng });
    } catch (e) {
      setError('Could not get place location');
    }
  };

  const getRoute = async (destination) => {
    if (!selfRider?.lat) { setError('GPS not ready yet'); return; }
    setRouting(true);
    setError('');
    try {
      const res  = await fetch(`${API}/directions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ origin: { lat: selfRider.lat, lng: selfRider.lng }, destination }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.source === 'osrm') setFallback(true);
      onRoute(data);
      setStepIdx(0);
      setShared(false);
    } catch (e) {
      setError('Could not get directions — try again');
    } finally {
      setRouting(false);
    }
  };

  const startNavigation = () => { setNavigating(true); setStepIdx(0); onClose(); };

  const shareRoute = () => {
    if (!route) return;
    socket.emit('route:share', route);
    setShared(true);
  };

  const clearRoute = () => {
    onRoute(null); setNavigating(false); setStepIdx(0);
    setShared(false); setQuery(''); setSuggestions([]); onClose();
  };

  const currentStep = route?.steps?.[stepIdx];

  return (
    <>
      {/* Turn-by-turn bar */}
      {navigating && currentStep && (
        <div className="absolute left-3 right-3 flex items-center gap-3
                        bg-[#1A1A1A]/95 backdrop-blur-sm border border-[#2A2A2A]
                        rounded-2xl px-4 py-3 shadow-xl"
             style={{ top: '7.5rem', zIndex: 1000 }}>
          <span className="text-2xl shrink-0">{maneuverIcon(currentStep.maneuver || currentStep.instruction)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-bold leading-tight truncate">{currentStep.instruction}</p>
            <p className="text-gray-400 text-xs">{formatDistance(currentStep.distance)}</p>
          </div>
          <div className="text-right shrink-0 mr-1">
            <p className="text-[#FFE500] text-xs font-bold tabular-nums">{formatDistance(route.distance)}</p>
            <p className="text-gray-500 text-xs">{formatDuration(route.duration)}</p>
          </div>
          <button onClick={clearRoute} className="text-gray-500 text-base active:scale-90 shrink-0">✕</button>
        </div>
      )}

      {/* Bottom sheet */}
      {open && (
        <div className="absolute bottom-0 left-0 right-0" style={{ zIndex: 2000 }}>
          <div className="flex flex-col bg-[#111111] rounded-t-3xl border-t border-x border-[#2A2A2A]"
               style={{ maxHeight: '70dvh' }}>

            <div className="flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="w-10 h-1 bg-[#3A3A3A] rounded-full" />
            </div>

            <div className="flex items-center justify-between px-4 py-2 border-b border-[#2A2A2A] shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-sm">Navigation</span>
                {fallback && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400">
                    OSM fallback
                  </span>
                )}
              </div>
              <button onClick={onClose}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 rounded-full bg-[#2A2A2A] active:scale-90">
                ✕
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pt-3 pb-2 shrink-0">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => handleQuery(e.target.value)}
                placeholder="Search destination…"
                style={{ fontSize: 16 }}
                className="w-full bg-[#2A2A2A] text-white rounded-2xl px-4 py-3
                           border border-transparent focus:border-[#FFE500]/40 outline-none"
              />
              {searching && <p className="text-gray-500 text-xs text-center mt-2">Searching…</p>}
              {routing   && <p className="text-gray-500 text-xs text-center mt-2">Getting route…</p>}
              {error     && <p className="text-red-400  text-xs text-center mt-2">{error}</p>}
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1.5 overscroll-contain">
                {suggestions.map((s, i) => (
                  <button key={s.place_id ?? i} onClick={() => selectSuggestion(s)}
                          className="w-full text-left flex items-start gap-3 px-4 py-3
                                     bg-[#2A2A2A] rounded-xl active:bg-[#3A3A3A] transition-colors">
                    <span className="text-base shrink-0 mt-0.5">📍</span>
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium leading-snug">{s.main_text}</p>
                      {s.secondary_text && (
                        <p className="text-gray-500 text-xs truncate mt-0.5">{s.secondary_text}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Route summary */}
            {route && !routing && suggestions.length === 0 && (
              <div className="px-4 pb-5 pt-1 shrink-0">
                <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-white font-bold">{formatDistance(route.distance)}</p>
                      <p className="text-gray-400 text-xs">
                        {formatDuration(route.duration)} · {route.source === 'osrm' ? 'OSM route' : 'fastest route'}
                      </p>
                    </div>
                    <button onClick={clearRoute} className="text-gray-500 text-xs px-2 py-1 rounded-lg bg-[#2A2A2A]">Clear</button>
                  </div>
                  {route.steps?.[0] && (
                    <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-[#0F0F0F] rounded-xl">
                      <span className="text-lg">{maneuverIcon(route.steps[0].maneuver || route.steps[0].instruction)}</span>
                      <p className="text-gray-300 text-xs leading-snug truncate flex-1">{route.steps[0].instruction}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {isLead && socket.connected && (
                      <button onClick={shareRoute} disabled={shared}
                              className="flex-1 py-3 rounded-xl text-sm font-bold bg-[#2A2A2A] text-white
                                         active:scale-95 transition-transform disabled:opacity-60">
                        {shared ? '✓ Shared' : '📡 Share with Group'}
                      </button>
                    )}
                    <button onClick={startNavigation}
                            className="flex-1 py-3 rounded-xl bg-[#FFE500] text-black font-black text-sm active:scale-95 transition-transform">
                      ▶ Start
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!route && !routing && suggestions.length === 0 && !searching && (
              <div className="flex-1 flex flex-col items-center justify-center pb-10 text-center px-6">
                <p className="text-4xl mb-3">🗺</p>
                <p className="text-white font-bold mb-1">Where are you riding?</p>
                <p className="text-gray-500 text-sm">Start typing — suggestions appear automatically.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
