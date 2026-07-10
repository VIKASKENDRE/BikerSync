/**
 * CrashCountdown — full-screen "Are you OK?" overlay.
 *
 * Native CrashDetector (accelerometer in LocationService) fires
 * 'crashSuspected'; this shows a 30 s countdown with a loud alarm and
 * vibration. If the rider doesn't cancel, an auto-SOS goes out on every
 * available transport. Big glove-friendly targets by design.
 *
 * Test from DevTools / chrome://inspect:  window.__bsSimulateCrash()
 */
import { useEffect, useRef, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { useRideContext } from '../../context/RideContext';
import { sendSOS } from '../../services/sosService';

const BgLocation = Capacitor.isNativePlatform() ? registerPlugin('BackgroundLocation') : null;
const COUNTDOWN_S = 30;

export default function CrashCountdown() {
  const { state, dispatch } = useRideContext();
  const [phase, setPhase] = useState('idle'); // idle | counting | sent
  const [remaining, setRemaining] = useState(COUNTDOWN_S);
  const alarmRef = useRef(null); // { ctx, timer }

  // Apply the user setting and subscribe to native detections
  useEffect(() => {
    if (!state.rideId) return;
    const enabled = localStorage.getItem('bs_crash_detection') !== 'off';
    BgLocation?.setCrashDetection({ enabled }).catch(() => {});

    let handle;
    if (BgLocation && enabled) {
      BgLocation.addListener('crashSuspected', () => {
        setPhase((p) => (p === 'idle' ? 'counting' : p));
      }).then((h) => { handle = h; });
    }
    window.__bsSimulateCrash = () => setPhase('counting');
    return () => {
      handle?.remove();
      delete window.__bsSimulateCrash;
    };
  }, [state.rideId]);

  // Countdown + alarm lifecycle
  useEffect(() => {
    if (phase !== 'counting') return;
    setRemaining(COUNTDOWN_S);
    startAlarm(alarmRef);

    const timer = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timer);
          fireSOS();
          return 0;
        }
        if (navigator.vibrate) navigator.vibrate(300);
        return r - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      stopAlarm(alarmRef);
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const fireSOS = async () => {
    stopAlarm(alarmRef);
    await sendSOS(state, dispatch, { auto: true });
    BgLocation?.crashHandled().catch(() => {});
    setPhase('sent');
  };

  const cancel = () => {
    stopAlarm(alarmRef);
    BgLocation?.crashHandled().catch(() => {});
    if (navigator.vibrate) navigator.vibrate(0);
    setPhase('idle');
  };

  if (phase === 'idle') return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-[rgba(60,8,8,0.98)] flex flex-col items-center justify-center px-6
                    pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {phase === 'counting' ? (
        <>
          <p className="text-red-300 font-black text-2xl tracking-widest uppercase">Crash detected</p>
          <p className="text-white font-black text-4xl mt-2 text-center">Are you OK?</p>

          <div className="my-8 w-40 h-40 rounded-full border-8 border-red-500 flex items-center justify-center
                          animate-pulse bg-red-900/60">
            <span className="text-white font-black text-7xl tabular-nums">{remaining}</span>
          </div>

          <p className="text-red-200 text-base text-center mb-8">
            SOS will be sent to your group automatically
          </p>

          <button
            onClick={cancel}
            className="w-full max-w-sm py-7 bg-white text-black font-black text-2xl rounded-2xl
                       active:scale-95 transition-transform"
          >
            ✓ I'M OK
          </button>
          <button
            onClick={fireSOS}
            className="w-full max-w-sm mt-4 py-4 bg-red-600 text-white font-black text-lg rounded-2xl
                       active:scale-95 transition-transform"
          >
            SEND SOS NOW
          </button>
        </>
      ) : (
        <>
          <p className="text-white font-black text-4xl text-center">🚨 SOS sent</p>
          <p className="text-red-200 text-base text-center mt-4">
            Your group has been alerted with your location
          </p>
          <button
            onClick={() => setPhase('idle')}
            className="w-full max-w-sm mt-10 py-5 bg-white/10 border border-white/30 text-white
                       font-bold text-lg rounded-2xl active:scale-95 transition-transform"
          >
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}

// ── Alarm (WebAudio — no asset needed, loud two-tone siren) ──────────────────

function startAlarm(ref) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    gain.connect(ctx.destination);

    let high = true;
    const beep = () => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = high ? 950 : 700;
      high = !high;
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    };
    beep();
    const timer = setInterval(beep, 450);
    ref.current = { ctx, timer };
  } catch {
    ref.current = null;
  }
}

function stopAlarm(ref) {
  if (!ref.current) return;
  clearInterval(ref.current.timer);
  ref.current.ctx.close().catch(() => {});
  ref.current = null;
}
