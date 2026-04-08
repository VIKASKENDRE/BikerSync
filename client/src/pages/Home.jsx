import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useRideContext } from '../context/RideContext';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../hooks/useAdmin';
import { useGPS } from '../hooks/useGPS';
import { socket } from '../services/socket';
import { api } from '../services/api';

const ROLES = ['rider', 'sweep'];

export default function Home() {
  const navigate = useNavigate();
  const { dispatch } = useRideContext();
  const { user, logout } = useAuth();
  const { isAdmin } = useAdmin();
  const { status: gpsStatus, requestGPS } = useGPS();

  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('join') ? 'join' : 'join');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [rideId, setRideId]   = useState(searchParams.get('join') ?? '');
  const [rideName, setRideName] = useState('');
  const [role, setRole]       = useState('rider');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [shareInfo, setShareInfo] = useState(null); // { rideId, url } after creating
  const [copied, setCopied]   = useState(false);

  // Use Firebase UID as stable riderId — consistent across devices
  const riderId = user?.uid ?? crypto.randomUUID();

  async function handleJoin() {
    setError('');
    if (!displayName.trim()) return setError('Enter your name');
    if (!rideId.trim()) return setError('Enter a Ride ID');

    setLoading(true);
    const gpsOk = await requestGPS();
    if (!gpsOk) { setLoading(false); return setError('GPS permission is required'); }

    try {
      await api.joinRide(rideId.toUpperCase(), riderId, displayName.trim(), role);

      socket.connect(); // start connecting early; ride:join is emitted by Ride.jsx

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
      const { rideId: newId } = await api.createRide(rideName.trim(), riderId, displayName.trim());
      const shareUrl = `${window.location.origin}/?join=${newId}`;

      socket.connect(); // start connecting early; ride:join is emitted by Ride.jsx

      dispatch({
        type: 'JOIN_RIDE',
        rideId: newId,
        selfRider: { riderId, displayName: displayName.trim(), role: 'lead', lat: null, lng: null, speed: 0 },
      });

      // Show share panel before navigating to map
      setShareInfo({ rideId: newId, url: shareUrl });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0F0F0F] flex flex-col items-center justify-center p-6 overflow-y-auto">

      {/* Logo + user info */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black text-[#FFE500] tracking-tight">BikerSync</h1>
        <p className="text-gray-400 text-sm mt-1">Stay together. Ride safe.</p>
      </div>

      {/* SHARE PANEL — shown after creating a ride */}
      {shareInfo && (
        <div className="w-full max-w-sm mb-4 bg-[#1A1A1A] border border-[#FFE500]/30 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[#FFE500] text-lg">🏍</span>
            <div>
              <p className="text-white font-bold text-sm">Ride Created!</p>
              <p className="text-gray-400 text-xs">Share the link with your group</p>
            </div>
          </div>

          {/* Ride ID pill */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-gray-400 text-xs">Ride ID</span>
            <span className="font-mono font-black text-[#FFE500] text-lg tracking-widest">
              {shareInfo.rideId}
            </span>
          </div>

          {/* Link box */}
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

      {/* Logged-in user bar */}
      <div className="w-full max-w-sm flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          {user?.photoURL && (
            <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full" />
          )}
          <span className="text-gray-400 text-sm truncate max-w-[200px]">
            {user?.displayName ?? user?.email}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button onClick={() => navigate('/admin')}
              className="text-[#FFE500] text-xs font-bold hover:text-[#FFE500]/80">
              Admin
            </button>
          )}
          <button onClick={logout} className="text-gray-600 text-xs hover:text-gray-400">
            Sign out
          </button>
        </div>
      </div>

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
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Raj Kumar"
              className="mt-1 w-full bg-[#2A2A2A] text-white rounded-xl px-4 py-3
                         border border-transparent focus:border-[#FFE500]/50 outline-none text-sm"
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
                  className={`mt-1 w-full bg-[#2A2A2A] text-white rounded-xl px-4 py-3 outline-none text-sm font-mono
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
                  className="mt-1 w-full bg-[#2A2A2A] text-white rounded-xl px-4 py-3
                             border border-transparent focus:border-[#FFE500]/50 outline-none text-sm"
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
              GPS blocked. Enable in browser Settings → Site Settings → Location.
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
    // Fallback for browsers that block clipboard API
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
