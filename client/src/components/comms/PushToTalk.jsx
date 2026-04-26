import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { socket } from '../../services/socket';
import { webrtcMesh } from '../../services/webrtcMesh';
import { wifiDirectMesh } from '../../services/wifiDirectMesh';
import Voice from '../../services/voice';
import { unlockAudio } from '../../hooks/useVoicePlayback';

const IS_NATIVE = Capacitor.isNativePlatform();

export default function PushToTalk() {
  const [transmitting, setTransmitting] = useState(false);
  const [inChannel,    setInChannel]    = useState(false);
  const [talker,       setTalker]       = useState(null); // displayName of who's currently talking
  const [micError,     setMicError]     = useState('');

  // Native path refs
  const voiceListenerRef = useRef(null);
  const nativeBusy       = useRef(false);

  // Web path refs
  const mediaRef    = useRef(null);
  const recorderRef = useRef(null);
  const webBusy     = useRef(false);

  // Group channel events — server opens channel for all when any rider transmits
  useEffect(() => {
    const onChannelOpen = () => setInChannel(true);
    const onIncoming    = ({ displayName }) => setTalker(displayName);
    const onEnded       = () => setTalker(null);

    socket.on('voice:channel:open', onChannelOpen);
    socket.on('voice:incoming',     onIncoming);
    socket.on('voice:ended',        onEnded);

    return () => {
      socket.off('voice:channel:open', onChannelOpen);
      socket.off('voice:incoming',     onIncoming);
      socket.off('voice:ended',        onEnded);
    };
  }, []);

  // ── Native PTT (Android APK — uses AudioRecord directly) ─────────────────
  const startNative = async () => {
    if (nativeBusy.current) return;
    nativeBusy.current = true;
    setMicError('');
    unlockAudio();
    try {
      await Voice.startRecording();

      voiceListenerRef.current = await Voice.addListener('audioChunk', ({ pcm16b64 }) => {
        if (socket.connected) {
          socket.emit('voice:chunk', pcm16b64);
        } else if (webrtcMesh.activePeerCount > 0) {
          webrtcMesh.broadcastVoiceChunk(pcm16b64);
        } else if (wifiDirectMesh.isActive) {
          wifiDirectMesh.broadcastVoiceChunk(pcm16b64);
        }
      });

      if (socket.connected) {
        socket.emit('voice:start', { mimeType: 'audio/pcm16;rate=16000' });
      } else if (webrtcMesh.activePeerCount > 0) {
        webrtcMesh.broadcastVoiceStart('audio/pcm16;rate=16000');
      } else if (wifiDirectMesh.isActive) {
        wifiDirectMesh.broadcastVoiceStart('audio/pcm16;rate=16000');
      }

      setTransmitting(true);
    } catch (err) {
      setMicError(err.message ?? 'Mic error');
      nativeBusy.current = false;
    }
  };

  const stopNative = async () => {
    if (!transmitting) return;
    setTransmitting(false);
    try { await Voice.stopRecording(); } catch {}
    try { await voiceListenerRef.current?.remove(); } catch {}
    voiceListenerRef.current = null;
    nativeBusy.current = false;
    if (socket.connected) socket.emit('voice:end');
    else if (webrtcMesh.activePeerCount > 0) webrtcMesh.broadcastVoiceEnd();
    else if (wifiDirectMesh.isActive) wifiDirectMesh.broadcastVoiceEnd();
  };

  // ── Web PTT (browser — uses getUserMedia / MediaRecorder) ─────────────────
  const startWeb = async () => {
    if (recorderRef.current || webBusy.current) return;
    webBusy.current = true;
    setMicError('');
    unlockAudio();
    try {
      // Try Samsung-friendly constraints first (avoids NotReadableError)
      let stream;
      for (const c of [
        { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } },
        { audio: true },
      ]) {
        try { stream = await navigator.mediaDevices.getUserMedia(c); break; } catch (e) {
          if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') throw e;
          await new Promise((r) => setTimeout(r, 600));
        }
      }
      if (!stream) throw new Error('NotReadableError');

      mediaRef.current = stream;
      const mimeType = [
        'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4',
      ].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      recorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0) return;
        if (socket.connected) socket.emit('voice:chunk', e.data);
        else webrtcMesh.broadcastVoiceChunk(await e.data.arrayBuffer());
      };

      recorder.start(200);
      if (socket.connected) socket.emit('voice:start', { mimeType: recorder.mimeType });
      else webrtcMesh.broadcastVoiceStart(recorder.mimeType);
      setTransmitting(true);
    } catch (err) {
      const msg =
        err.name === 'NotFoundError'    ? 'No mic found' :
        err.name === 'NotAllowedError'  ? 'Mic denied'   :
        err.name === 'NotReadableError' ? 'Mic busy'     :
        `Mic: ${err.name ?? 'error'}`;
      setMicError(msg);
    } finally {
      webBusy.current = false;
    }
  };

  const stopWeb = () => {
    if (!recorderRef.current) return;
    setTransmitting(false);
    const recorder = recorderRef.current;
    const stream   = mediaRef.current;
    recorderRef.current = null;
    mediaRef.current    = null;
    const wasOnline = socket.connected;
    recorder.onstop = () => {
      if (wasOnline) socket.emit('voice:end');
      else webrtcMesh.broadcastVoiceEnd();
      stream?.getTracks().forEach((t) => t.stop());
    };
    recorder.stop();
  };

  const startTalk = IS_NATIVE ? startNative : startWeb;

  // X when transmitting → mute yourself (stop mic, stay in channel)
  const muteSelf = IS_NATIVE ? stopNative : stopWeb;

  // X when in channel but not transmitting → leave channel (hides UI for this rider)
  const leaveChannel = () => setInChannel(false);

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Channel status bar — visible to all riders while channel is open */}
      {inChannel && (
        <div className="text-xs font-semibold text-[#FF6B00] tracking-wide">
          {talker ? `🔊 ${talker}` : '● CHANNEL LIVE'}
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* X: mute if transmitting, leave channel if listening */}
        {inChannel && (
          <button
            onClick={transmitting ? muteSelf : leaveChannel}
            className="w-10 h-10 rounded-full bg-red-700 border border-red-500/60
                       flex items-center justify-center text-white text-sm font-black
                       active:scale-95 transition-transform shadow-lg"
            aria-label={transmitting ? 'Mute microphone' : 'Leave voice channel'}
          >✕</button>
        )}

        <button
          onClick={transmitting ? muteSelf : startTalk}
          className={`w-20 h-20 rounded-full font-bold text-sm border-2 select-none
                      transition-all duration-100 flex flex-col items-center justify-center gap-1
                      ${micError
                        ? 'bg-[#2A2A2A] border-red-500/60 text-red-400'
                        : transmitting
                        ? 'bg-[#FF6B00] border-[#FF6B00] text-black scale-110 shadow-[0_0_24px_rgba(255,107,0,0.7)]'
                        : inChannel
                        ? 'bg-[#2A2A2A] border-[#FF6B00]/60 text-[#FF6B00]'
                        : 'bg-[#2A2A2A] border-[#2A2A2A] text-white'
                      }`}
          aria-label={transmitting ? 'Mute microphone' : inChannel ? 'Tap to talk' : 'Open voice channel'}
        >
          <span className="text-xl">{micError ? '🚫' : transmitting ? '🔴' : '🎙'}</span>
          <span className="text-xs leading-tight text-center px-1">
            {micError ? micError : transmitting ? 'LIVE' : 'TALK'}
          </span>
        </button>
      </div>
    </div>
  );
}
