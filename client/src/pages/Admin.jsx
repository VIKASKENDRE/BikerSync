import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin } from '../hooks/useAdmin';

export default function Admin() {
  const navigate = useNavigate();
  const { isAdmin, loading, adminFetch } = useAdmin();

  const [tab,      setTab]      = useState('rides');
  const [rides,    setRides]    = useState([]);
  const [users,    setUsers]    = useState([]);
  const [stats,    setStats]    = useState(null);
  const [apiUsage, setApiUsage] = useState([]);
  const [busy,     setBusy]     = useState(false);
  const [msg,      setMsg]      = useState('');

  useEffect(() => {
    if (!loading && !isAdmin) navigate('/', { replace: true });
  }, [isAdmin, loading]);

  useEffect(() => {
    if (!isAdmin) return;
    adminFetch('/api/admin/stats').then(setStats).catch(() => {});
    adminFetch('/api/admin/rides').then(setRides).catch(() => {});
    adminFetch('/api/admin/users').then(setUsers).catch(() => {});
    adminFetch('/api/admin/api-usage').then(setApiUsage).catch(() => {});
  }, [isAdmin]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const deleteRide = async (rideId) => {
    if (!confirm(`Delete ride ${rideId}?`)) return;
    setBusy(true);
    try {
      await adminFetch(`/api/admin/rides/${rideId}`, { method: 'DELETE' });
      setRides((r) => r.filter((x) => x.rideId !== rideId));
      setStats((s) => s ? { ...s, totalRides: s.totalRides - 1 } : s);
      flash(`Ride ${rideId} deleted`);
    } catch (e) { flash(e.message); }
    setBusy(false);
  };

  const deleteUser = async (uid, name) => {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await adminFetch(`/api/admin/users/${uid}`, { method: 'DELETE' });
      setUsers((u) => u.filter((x) => x.uid !== uid));
      setStats((s) => s ? { ...s, totalUsers: s.totalUsers - 1 } : s);
      flash(`User "${name}" deleted`);
    } catch (e) { flash(e.message); }
    setBusy(false);
  };

  const reset = async (target) => {
    const labels = { rides: 'ALL rides', sos: 'all SOS events', all: 'ALL data' };
    if (!confirm(`This will permanently delete ${labels[target]}. Continue?`)) return;
    setBusy(true);
    try {
      await adminFetch('/api/admin/reset', { method: 'POST', body: { target } });
      if (target === 'rides' || target === 'all') { setRides([]); }
      flash(`Reset complete: ${target}`);
      adminFetch('/api/admin/stats').then(setStats).catch(() => {});
    } catch (e) { flash(e.message); }
    setBusy(false);
  };

  if (loading) return <Spinner />;
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-white">

      {/* Header */}
      <div className="border-b border-[#2A2A2A] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-[#FFE500]">BikerSync Admin</h1>
          <p className="text-gray-500 text-xs mt-0.5">Control panel</p>
        </div>
        <button onClick={() => navigate('/')}
          className="text-gray-400 text-sm hover:text-white transition-colors">
          ← Back to App
        </button>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-6">
          {[
            { label: 'Total Rides',   value: stats.totalRides,  color: 'text-[#FFE500]' },
            { label: 'Active Rides',  value: stats.activeRides, color: 'text-green-400' },
            { label: 'Registered Users', value: stats.totalUsers, color: 'text-blue-400' },
            { label: 'SOS Events',    value: stats.totalSOS,    color: 'text-red-400' },
          ].map((s) => (
            <div key={s.label} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-4">
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-gray-500 text-xs mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Flash message */}
      {msg && (
        <div className="mx-6 mb-4 px-4 py-2 bg-[#1A1A1A] border border-[#FFE500]/30
                        rounded-xl text-[#FFE500] text-sm text-center">
          {msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[#2A2A2A] px-6">
        {['rides', 'users', 'api', 'reset'].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`py-3 px-4 text-sm font-bold capitalize transition-colors mr-2
              ${tab === t ? 'text-[#FFE500] border-b-2 border-[#FFE500]' : 'text-gray-400'}`}>
            {t === 'reset' ? '⚠ Reset' : t === 'api' ? '📡 API Usage' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="p-6">

        {/* RIDES TAB */}
        {tab === 'rides' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-[#2A2A2A]">
                  <th className="text-left pb-3">Ride ID</th>
                  <th className="text-left pb-3">Name</th>
                  <th className="text-left pb-3">Status</th>
                  <th className="text-left pb-3">Riders</th>
                  <th className="text-left pb-3">Created</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]">
                {rides.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-600">No rides found</td></tr>
                )}
                {rides.map((r) => (
                  <tr key={r.rideId} className="hover:bg-[#1A1A1A] transition-colors">
                    <td className="py-3 font-mono text-[#FFE500]">{r.rideId}</td>
                    <td className="py-3 text-white">{r.name}</td>
                    <td className="py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-3 text-gray-300">{r.riders?.length ?? 0}</td>
                    <td className="py-3 text-gray-500 text-xs">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-right">
                      <button onClick={() => deleteRide(r.rideId)} disabled={busy}
                        className="px-3 py-1 bg-red-900/50 border border-red-700/50 text-red-400
                                   text-xs rounded-lg hover:bg-red-900 transition-colors disabled:opacity-40">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* USERS TAB */}
        {tab === 'users' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-[#2A2A2A]">
                  <th className="text-left pb-3">Name</th>
                  <th className="text-left pb-3">Email</th>
                  <th className="text-left pb-3">Provider</th>
                  <th className="text-left pb-3">Joined</th>
                  <th className="text-left pb-3">Last Sign-in</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A1A1A]">
                {users.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-gray-600">No users found</td></tr>
                )}
                {users.map((u) => (
                  <tr key={u.uid} className="hover:bg-[#1A1A1A] transition-colors">
                    <td className="py-3 text-white font-medium">{u.displayName}</td>
                    <td className="py-3 text-gray-300">{u.email}</td>
                    <td className="py-3">
                      <span className="text-xs px-2 py-0.5 rounded bg-[#2A2A2A] text-gray-400">
                        {u.provider === 'google.com' ? 'Google' : u.provider}
                      </span>
                    </td>
                    <td className="py-3 text-gray-500 text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-gray-500 text-xs">
                      {u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3 text-right">
                      <button onClick={() => deleteUser(u.uid, u.displayName)} disabled={busy}
                        className="px-3 py-1 bg-red-900/50 border border-red-700/50 text-red-400
                                   text-xs rounded-lg hover:bg-red-900 transition-colors disabled:opacity-40">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* API USAGE TAB */}
        {tab === 'api' && (
          <div className="space-y-4 max-w-2xl">
            <p className="text-gray-500 text-sm">
              All Google Maps API calls are proxied through the server and tracked here.
              When estimated cost reaches <span className="text-[#FFE500] font-bold">$190</span>,
              the proxy automatically switches to free OSM/OSRM fallbacks for the rest of the month.
            </p>
            {apiUsage.length === 0 && (
              <p className="text-gray-600 text-sm">No usage recorded yet.</p>
            )}
            {apiUsage.map((u) => {
              const pct     = Math.min((u.estimatedCost / 200) * 100, 100);
              const barColor = pct >= 95 ? 'bg-red-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-green-500';
              return (
                <div key={u.month} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-white font-bold">{u.month}</p>
                      <p className="text-gray-500 text-xs">
                        {u.fallbackMode
                          ? <span className="text-yellow-400 font-bold">⚠ Fallback mode active (OSM/OSRM)</span>
                          : <span className="text-green-400">✓ Google APIs active</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[#FFE500] font-black text-lg">${u.estimatedCost.toFixed(3)}</p>
                      <p className="text-gray-500 text-xs">of $200 free credit</p>
                    </div>
                  </div>

                  {/* Budget bar */}
                  <div className="w-full h-2 bg-[#2A2A2A] rounded-full mb-4 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>

                  {/* Per-API breakdown */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { key: 'autocomplete', label: 'Autocomplete', rate: '$2.83/1k' },
                      { key: 'details',      label: 'Place Details', rate: '$17/1k' },
                      { key: 'directions',   label: 'Directions',    rate: '$5/1k' },
                    ].map(({ key, label, rate }) => (
                      <div key={key} className="bg-[#0F0F0F] rounded-xl p-3 text-center">
                        <p className="text-white font-bold text-lg">{u[key] ?? 0}</p>
                        <p className="text-gray-400 text-xs">{label}</p>
                        <p className="text-gray-600 text-xs">{rate}</p>
                      </div>
                    ))}
                  </div>

                  {/* Reset fallback button */}
                  {u.fallbackMode && (
                    <button
                      onClick={async () => {
                        await adminFetch('/api/admin/api-usage/reset-fallback', { method: 'POST', body: { month: u.month } });
                        setApiUsage((prev) => prev.map((r) => r.month === u.month ? { ...r, fallbackMode: false } : r));
                        flash('Fallback mode cleared — Google APIs re-enabled');
                      }}
                      className="mt-3 w-full py-2 rounded-xl bg-[#2A2A2A] text-yellow-400 font-bold text-sm
                                 active:scale-95 transition-transform"
                    >
                      Re-enable Google APIs for {u.month}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* RESET TAB */}
        {tab === 'reset' && (
          <div className="max-w-md space-y-4">
            <p className="text-gray-400 text-sm">
              These actions are permanent and cannot be undone.
            </p>
            {[
              {
                target: 'rides',
                label: 'Delete All Rides',
                desc: 'Removes all ride records and associated SOS events from MongoDB.',
                color: 'border-orange-700/50 text-orange-400 hover:bg-orange-900/30',
              },
              {
                target: 'sos',
                label: 'Clear SOS History',
                desc: 'Removes all logged SOS events.',
                color: 'border-orange-700/50 text-orange-400 hover:bg-orange-900/30',
              },
              {
                target: 'all',
                label: 'Reset Everything',
                desc: 'Wipes all rides and SOS events. User accounts are preserved.',
                color: 'border-red-700/50 text-red-400 hover:bg-red-900/30',
              },
            ].map((item) => (
              <div key={item.target}
                className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-bold text-white">{item.label}</p>
                  <p className="text-gray-500 text-xs mt-1">{item.desc}</p>
                </div>
                <button onClick={() => reset(item.target)} disabled={busy}
                  className={`flex-shrink-0 px-4 py-2 border rounded-xl text-sm font-bold
                              transition-colors disabled:opacity-40 ${item.color}`}>
                  Run
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    active:  'bg-green-900/40 text-green-400 border-green-700/40',
    ended:   'bg-gray-800 text-gray-500 border-gray-700',
    pending: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/40',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  );
}

function Spinner() {
  return (
    <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#FFE500] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
