import { useState, useEffect } from 'react';
import { useRideContext } from '../../context/RideContext';
import { sendSOS } from '../../services/sosService';

export default function SOSButton() {
  const { state, dispatch } = useRideContext();
  const [status, setStatus] = useState('idle'); // idle | sent

  // Reset when SOS alert is cleared by any rider
  useEffect(() => {
    if (state.sosAlert === null && status === 'sent') setStatus('idle');
  }, [state.sosAlert]); // eslint-disable-line

  const triggerSOS = async () => {
    if (status === 'sent') return;
    const ok = await sendSOS(state, dispatch);
    if (ok) setStatus('sent');
  };

  return (
    <button
      onClick={triggerSOS}
      className={`w-14 h-14 rounded-full font-black text-white text-sm
                  border-2 shadow-lg select-none transition-all duration-150
                  flex flex-col items-center justify-center gap-0.5
                  ${status === 'sent'
                    ? 'bg-red-600 border-red-400 animate-pulse shadow-sos'
                    : 'bg-red-700/80 border-red-500 active:scale-110'}`}
      aria-label="SOS"
    >
      <span>SOS</span>
      {status === 'sent' && <span className="text-xs font-normal">SENT</span>}
    </button>
  );
}
