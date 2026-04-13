const ROLE_DOT = { lead: 'bg-neon-yellow', sweep: 'bg-neon-orange', rider: 'bg-white' };
const ROLE_LABEL = { lead: 'Lead', sweep: 'Sweep', rider: 'Rider' };

export default function RiderList({ riders, selfRider, onAssignLead, onClose }) {
  const isLead = selfRider?.role === 'lead';
  const online  = riders.filter((r) => r.online !== false);
  const offline = riders.filter((r) => r.online === false);

  return (
    <div className="bg-surface-2/95 backdrop-blur-sm border border-surface-3 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-3">
        <span className="text-sm font-bold text-white">Riders ({online.length} online)</span>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 text-lg min-w-0 min-h-0 w-8 h-8">✕</button>
        )}
      </div>
      <ul className="divide-y divide-surface-3">
        {[...online, ...offline].map((rider) => {
          const isSelf  = rider.riderId === selfRider?.riderId;
          const canMake = isLead && !isSelf && rider.role !== 'lead' && rider.online !== false;
          return (
            <li key={rider.riderId} className="flex items-center gap-3 px-4 py-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                rider.online !== false ? (ROLE_DOT[rider.role] ?? 'bg-white') : 'bg-gray-600'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">
                  {rider.displayName}{isSelf && <span className="text-gray-500 text-xs ml-1">(you)</span>}
                </p>
                <p className="text-xs text-gray-500">{ROLE_LABEL[rider.role] ?? 'Rider'}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-right">
                  {rider.speed != null && rider.online !== false && (
                    <p className="text-xs text-neon-yellow font-bold">{rider.speed} km/h</p>
                  )}
                  {rider.battery != null && (
                    <p className="text-xs text-gray-400">🔋{rider.battery}%</p>
                  )}
                  {rider.online === false && (
                    <p className="text-xs text-gray-600">Offline</p>
                  )}
                </div>
                {canMake && (
                  <button
                    onClick={() => onAssignLead?.(rider.riderId)}
                    className="px-2 py-0.5 text-xs font-bold rounded-lg
                               bg-[#FFE500]/10 border border-[#FFE500]/30 text-[#FFE500]
                               active:scale-95 transition-transform whitespace-nowrap"
                  >
                    ★ Lead
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
