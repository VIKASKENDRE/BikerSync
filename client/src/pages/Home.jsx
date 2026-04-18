import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRideContext } from '../context/RideContext';
import { useAuth } from '../context/AuthContext';
import { useGPS } from '../hooks/useGPS';
import { socket } from '../services/socket';
import { api } from '../services/api';

const ROLES = ['rider', 'sweep'];

export default function Home() {
  const navigate = useNavigate();
  const { dispatch } = useRideContext();
  const { user, updateDisplayName } = useAuth();
  const { status: gpsStatus, requestGPS } = useGPS();

  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('join');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [rideId, setRideId]   = useState(searchParams.get('join') ?? '');
  const [rideName, setRideName] = useState('');
  const [role, setRole]       = useState('rider');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [shareInfo, setShareInfo] = useState(null);
  const [copied, setCopied]   = useState(false);

  // Stable riderId from localStorage (set once at install, never changes)
  const riderId = user.uid;

  const saveName = (name) => {
    setDisplayName(name);
    if (name.trim()) updateDisplayName(name);
  };

  async function handleJoin() {
    setError('');
    if (!displayName.trim()) return setError('Enter your name');
    if (!rideId.trim()) return setError('Enter a Ride ID');

    setLoading(true);
    const gpsOk = await requestGPS();
    if (!gpsOk) { setLoading(false); return setError('GPS permission is required'); }

    try {
      await api.joinRide(rideId.toUpperCase(), riderId, displayName.trim(), role)
        .catch(() => {});

      socket.connect();

      dispatch({
        type: 'JOIN_RIDE',
        rideId: rideId.toUpperCase(),
        selfRider: { riderId, displayName: displayName.trim(), role, lat: null, lng: null, speed: 0 },
      });

      navigate(`/ride/${rideId.toUpperCase()}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setError('');
    if (!displayName.trim()) return setError('Enter your name');
    if (!rideName.trim()) return setError('Enter a ride name');

    setLoading(true);
    const gpsOk = await requestGPS();
    if (!gpsOk) { setLoading(false); return setError('GPS permission is required'); }

    try {
      let newId;
      try {
        const data = await api.createRide(rideName.trim(), riderId, displayName.trim());
        newId = data.rideId;
      } catch {
        newId = Math.random().toString(36).slice(2, 6).toUpperCase() +
                Math.random().toString(36).slice(2, 6).toUpperCase();
      }
      const shareUrl = `${window.location.origin}/?join=${newId}`;

      socket.connect();

      dispatch({
        type: 'JOIN_RIDE',
        rideId: newId,
        selfRider: { riderId, displayName: displayName.trim(), role: 'lead', lat: null, lng: null, speed: 0 },
      });

      setShareInfo({ rideId: newId, url: shareUrl });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#0F0F0F] flex flex-col items-center justify-center px-6 overflow-y-auto
                    pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">

      {/* Logo */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black text-[#FFE500] tracking-tight">BikerSync</h1>
        <p className="text-gray-400 text-sm mt-1">Stay together. Ride safe.</p>
      </div>

      {/* Share panel — shown after creating a ride */}
      {shareInfo && (
        <div className="w-full max-w-sm mb-4 bg-[#1A1A1A] border border-[#FFE500]/30 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[#FFE500] text-lg">🏍</span>
            <div>
              <p className="text-white font-bold text-sm">Ride Created!</p>
              <p className="text-gray-400 text-xs">Share the link with your group</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <span className="text-gray-400 text-xs">Ride ID</span>
            <span className="font-mono font-black text-[#FFE500] text-lg tracking-widest">
              {shareInfo.rideId}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-[#0F0F0F] rounded-xl px-3 py-2 mb-3">
            <span className="text-gray-400 text-xs truncate flex-1">{shareInfo.url}</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => copyLink(shareInfo.url, setCopied)}
              className="flex-1 py-2.5 bg-[#2A2A2A] text-white text-sm font-bold rounded-xl
                         active:scale-95 transition-transform"
            >
              {copied ? '✓ Copied!' : '📋 Copy Link'}
            </button>
            {'share' in navigator && (
              <button
                onClick={() => nativeShare(shareInfo.rideId, shareInfo.url)}
                className="flex-1 py-2.5 bg-[#FFE500] text-black text-sm font-bold rounded-xl
                           active:scale-95 transition-transform"
              >
                ↗ Share
              </button>
            )}
          </div>

          <button
            onClick={() => navigate(`/ride/${shareInfo.rideId}`)}
            className="w-full mt-3 py-3 bg-[#FF6B00] text-black font-black text-base rounded-xl
                       active:scale-95 transition-transform"
          >
            Start Ride →
          </button>
        </div>
      )}

      {/* Card */}
      <div className="w-full max-w-sm bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl overflow-hidden">
        <div className="flex border-b border-[#2A2A2A]">
          {['join', 'create'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-bold capitalize transition-colors
                ${tab === t ? 'text-[#FFE500] border-b-2 border-[#FFE500]' : 'text-gray-400'}`}
            >
              {t === 'join' ? 'Join Ride' : 'Create Ride'}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider">Your Name</label>
            <input
              value={displayName}
              onChange={(e) => saveName(e.target.value)}
              placeholder="e.g. Raj Kumar"
              style={{ fontSize: 16 }}
              className="mt-1 w-full bg-[#2A2A2A] text-white rounded-xl px-4 py-3
                         border border-transparent focus:border-[#FFE500]/50 outline-none"
            />
          </div>

          {tab === 'join' ? (
            <>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">Ride ID</label>
                <input
                  value={rideId}
                  onChange={(e) => setRideId(e.target.value.toUpperCase())}
                  placeholder="e.g. A1B2C3D4"
                  maxLength={8}
                  style={{ fontSize: 16 }}
                  className={`mt-1 w-full bg-[#2A2A2A] text-white rounded-xl px-4 py-3 outline-none font-mono
                             border ${searchParams.get('join') && rideId === searchParams.get('join')
                               ? 'border-[#FFE500]/60 bg-[#FFE500]/5'
                               : 'border-transparent focus:border-[#FFE500]/50'}`}
                />
                {searchParams.get('join') && rideId === searchParams.get('join') && (
                  <p className="text-[#FFE500] text-xs mt-1">✓ Ride ID filled from shared link</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">Your Role</label>
                <div className="mt-1 flex gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold capitalize border transition-colors
                        ${role === r
                          ? 'bg-[#FFE500]/20 border-[#FFE500]/50 text-[#FFE500]'
                          : 'bg-[#2A2A2A] border-[#2A2A2A] text-gray-400'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleJoin}
                disabled={loading}
                className="w-full py-4 bg-[#FFE500] text-black font-black text-base rounded-xl
                           active:scale-95 transition-transform disabled:opacity-50"
              >
                {loading ? 'Joining...' : 'Join Ride'}
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">Ride Name</label>
                <input
                  value={rideName}
                  onChange={(e) => setRideName(e.target.value)}
                  placeholder="e.g. Pune to Mahabaleshwar"
                  style={{ fontSize: 16 }}
                  className="mt-1 w-full bg-[#2A2A2A] text-white rounded-xl px-4 py-3
                             border border-transparent focus:border-[#FFE500]/50 outline-none"
                />
              </div>
              <p className="text-xs text-gray-500">You'll be assigned as Ride Lead automatically.</p>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full py-4 bg-[#FF6B00] text-black font-black text-base rounded-xl
                           active:scale-95 transition-transform disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create & Lead'}
              </button>
            </>
          )}

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          {gpsStatus === 'denied' && (
            <p className="text-[#FF6B00] text-xs text-center">
              GPS blocked. Enable in Settings → Location.
            </p>
          )}
        </div>
      </div>

      <p className="mt-6 text-gray-600 text-xs text-center">
        Keep app open during ride · HTTPS required for GPS
      </p>
    </div>
  );
}

async function copyLink(url, setCopied) {
  try {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  } catch {
    const el = document.createElement('textarea');
    el.value = url;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
}

function nativeShare(rideId, url) {
  navigator.share({
    title: 'Join my BikerSync ride',
    text: `Join my group ride! Ride ID: ${rideId}`,
    url,
  }).catch(() => {});
}
