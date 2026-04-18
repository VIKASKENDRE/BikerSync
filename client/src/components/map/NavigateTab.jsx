import { useState, useRef, useEffect } from 'react';

const API = `${import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000'}/api/maps`;

/**
 * Opens Google Maps (native app) for turn-by-turn navigation.
 *
 * Deep-link strategy:
 *   geo: URI  →  Android resolves it to Google Maps (or any maps app)
 *   maps.google.com directions URL  →  fallback if geo: not handled
 *
 * window.open(url, '_system') tells Capacitor to fire an Android Intent
 * instead of opening in the in-app WebView.
 */
function openInGoogleMaps({ origin, destination, destName }) {
  // Navigation intent — most reliable way to launch Google Maps for turn-by-turn
  const navUrl = [
    'https://www.google.com/maps/dir/?api=1',
    origin ? `&origin=${origin.lat},${origin.lng}` : '',
    `&destination=${destination.lat},${destination.lng}`,
    '&travelmode=driving',
  ].join('');

  window.open(navUrl, '_system');
}

function openCurrentLocationInMaps(lat, lng) {
  // geo: URI — shows device location in Google Maps (or default maps app)
  window.open(`geo:${lat},${lng}?z=15`, '_system');
}

export default function NavigateTab({ selfRider }) {
  const [query,       setQuery]       = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [selected,    setSelected]    = useState(null); // { lat, lng, name }
  const [error,       setError]       = useState('');
  const debounceRef = useRef(null);
  const inputRef    = useRef(null);

  // Auto-focus search on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 180);
  }, []);

  const handleQuery = (val) => {
    setQuery(val);
    setSelected(null);
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
      } catch {
        setError('Search unavailable — check connection');
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const selectSuggestion = async (s) => {
    setSuggestions([]);
    setQuery(s.main_text);
    setError('');

    // Nominatim result already has coords
    if (s._lat != null) {
      setSelected({ lat: s._lat, lng: s._lng, name: s.main_text });
      return;
    }

    // Resolve place_id → coords via server proxy
    try {
      const res  = await fetch(`${API}/details?placeId=${encodeURIComponent(s.place_id)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSelected({ lat: data.lat, lng: data.lng, name: s.main_text });
    } catch {
      setError('Could not get location — try again');
    }
  };

  const navigate = () => {
    if (!selected) return;
    openInGoogleMaps({
      origin:      selfRider?.lat ? { lat: selfRider.lat, lng: selfRider.lng } : null,
      destination: selected,
      destName:    selected.name,
    });
  };

  const hasGPS = Boolean(selfRider?.lat);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Current location shortcut */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <button
          onClick={() => hasGPS && openCurrentLocationInMaps(selfRider.lat, selfRider.lng)}
          disabled={!hasGPS}
          className="w-full flex items-center gap-3 px-4 py-3
                     bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl
                     active:scale-[0.98] transition-transform disabled:opacity-40"
        >
          <span className="text-xl shrink-0">📍</span>
          <div className="text-left min-w-0">
            <p className="text-white text-sm font-bold leading-none mb-0.5">My current location</p>
            <p className="text-gray-500 text-xs truncate">
              {hasGPS
                ? `${selfRider.lat.toFixed(5)}, ${selfRider.lng.toFixed(5)} · ${selfRider.speed ?? 0} km/h`
                : 'GPS not ready yet'}
            </p>
          </div>
          <span className="text-gray-500 text-sm ml-auto shrink-0">Open ↗</span>
        </button>
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-[#2A2A2A] shrink-0" />

      {/* Search */}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Navigate to</p>
        <div className="relative">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQuery(e.target.value)}
            placeholder="Search destination…"
            style={{ fontSize: 16 }}
            className="w-full bg-[#2A2A2A] text-white rounded-2xl pl-4 pr-10 py-3
                       border border-transparent focus:border-[#FFE500]/40 outline-none"
          />
          {query.length > 0 && (
            <button
              onClick={() => { setQuery(''); setSelected(null); setSuggestions([]); setError(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg"
            >✕</button>
          )}
        </div>
        {searching && <p className="text-gray-500 text-xs text-center mt-2">Searching…</p>}
        {error     && <p className="text-red-400 text-xs text-center mt-2">{error}</p>}
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1.5 overscroll-contain">
          {suggestions.map((s, i) => (
            <button
              key={s.place_id ?? i}
              onClick={() => selectSuggestion(s)}
              className="w-full text-left flex items-start gap-3 px-4 py-3
                         bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl
                         active:bg-[#2A2A2A] transition-colors"
            >
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

      {/* Destination selected → show Navigate button */}
      {selected && suggestions.length === 0 && (
        <div className="px-4 pt-2 pb-3 shrink-0">
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-4 mb-3">
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0 mt-0.5">🏁</span>
              <div className="min-w-0">
                <p className="text-white font-bold text-sm leading-snug">{selected.name}</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={navigate}
            className="w-full py-4 bg-[#4285F4] text-white font-black text-base rounded-2xl
                       flex items-center justify-center gap-2
                       active:scale-[0.98] transition-transform"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            Navigate with Google Maps
          </button>
          {!hasGPS && (
            <p className="text-gray-500 text-xs text-center mt-2">
              GPS not ready — Google Maps will use device location
            </p>
          )}
        </div>
      )}

      {/* Empty state */}
      {!selected && suggestions.length === 0 && !searching && query.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center pb-6 text-center px-6">
          <p className="text-5xl mb-4">🗺</p>
          <p className="text-white font-bold mb-1">Where are you riding to?</p>
          <p className="text-gray-500 text-sm leading-relaxed">
            Search a destination above and tap Navigate — it opens in the Google Maps app on your phone.
          </p>
        </div>
      )}
    </div>
  );
}
