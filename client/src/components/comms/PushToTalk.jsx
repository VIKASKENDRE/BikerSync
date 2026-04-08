import { useRef, useState } from 'react';
import { socket } from '../../services/socket';
import { webrtcMesh } from '../../services/webrtcMesh';
import { unlockAudio } from '../../hooks/useVoicePlayback';

export default function PushToTalk() {
  const [transmitting, setTransmitting] = useState(false);
  const [micError, setMicError] = useState('');
  const mediaRef    = useRef(null);
  const recorderRef = useRef(null);
  const busyRef     = useRef(false); // blocks re-entry during async getUserMedia

  const startTalk = async () => {
    if (recorderRef.current || busyRef.current) return;
    busyRef.current = true;
    setMicError('');
    unlockAudio(); // unlock AudioContext on this device while we have a user gesture
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRef.current = stream;

      // Pick the first format the browser supports (Safari/iOS needs audio/mp4)
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      recorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0) return;
        if (socket.connected) {
          socket.emit('voice:chunk', e.data);
        } else {
          webrtcMesh.broadcastVoiceChunk(await e.data.arrayBuffer());
        }
      };

      recorder.start(200);
      if (socket.connected) {
        socket.emit('voice:start', { mimeType: recorder.mimeType });
      } else {
        webrtcMesh.broadcastVoiceStart(recorder.mimeType);
      }
      setTransmitting(true);
    } catch (err) {
      const msg =
        err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'
          ? 'No microphone found'
          : err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Mic permission denied'
          : 'Mic unavailable';
      setMicError(msg);
      console.warn('[PTT]', err.message);
    } finally {
      busyRef.current = false;
    }
  };

  const stopTalk = () => {
    if (!recorderRef.current) return;
    setTransmitting(false);

    const recorder = recorderRef.current;
    const stream   = mediaRef.current;
    recorderRef.current = null;
    mediaRef.current    = null;

    // onstop fires AFTER the final dataavailable chunk — guarantees all
    // chunks are sent before the end signal triggers playback
    const wasOnline = socket.connected;
    recorder.onstop = () => {
      if (wasOnline) {
        socket.emit('voice:end');
      } else {
        webrtcMesh.broadcastVoiceEnd();
      }
      stream?.getTracks().forEach((t) => t.stop());
    };
    recorder.stop();
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onPointerDown={startTalk}
        onPointerUp={stopTalk}
        onPointerLeave={stopTalk}
        className={`w-20 h-20 rounded-full font-bold text-sm border-2 select-none
                    transition-all duration-100 flex flex-col items-center justify-center gap-1
                    ${micError
                      ? 'bg-[#2A2A2A] border-red-500/60 text-red-400'
                      : transmitting
                      ? 'bg-[#FF6B00] border-[#FF6B00] text-black scale-110 shadow-[0_0_24px_rgba(255,107,0,0.7)]'
                      : 'bg-[#2A2A2A] border-[#2A2A2A] text-white'
                    }`}
        aria-label="Push to talk"
      >
        <span className="text-xl">{micError ? '🚫' : transmitting ? '🔴' : '🎙'}</span>
        <span className="text-xs leading-tight text-center px-1">
          {micError ? micError : transmitting ? 'LIVE' : 'TALK'}
        </span>
      </button>
    </div>
  );
}
