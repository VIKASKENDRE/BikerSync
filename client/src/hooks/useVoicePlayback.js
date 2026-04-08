// Handles receiving and playing PTT audio from other riders.
// Works over both Socket.io (online) and WebRTC DataChannels (offline/hotspot).
import { useEffect, useRef } from 'react';
import { socket } from '../services/socket';
import { webrtcMesh } from '../services/webrtcMesh';

// Singleton AudioContext — created once, reused for all playback
let _audioCtx = null;

async function getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_audioCtx.state === 'suspended') await _audioCtx.resume();
  return _audioCtx;
}

// Call once on any user interaction to pre-unlock the AudioContext on mobile
export function unlockAudio() {
  getAudioCtx(); // fire-and-forget — just warms up the context
}

async function playBlob(blob) {
  const url = URL.createObjectURL(blob);
  const ctx  = await getAudioCtx();

  // ── Primary: decodeAudioData ──────────────────────────────────────────────
  // Works on desktop Chrome/Firefox. Fails on some Android versions for WebM.
  try {
    const buf    = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf);
    const src    = ctx.createBufferSource();
    src.buffer   = decoded;
    src.connect(ctx.destination);
    src.start(0);
    src.onended = () => URL.revokeObjectURL(url);
    return;
  } catch {
    // fall through to HTMLAudioElement path
  }

  // ── Fallback: HTMLAudioElement routed through AudioContext ────────────────
  // createMediaElementSource bypasses autoplay policy on Android/iOS because
  // the AudioContext is already unlocked by the user's PTT button press.
  try {
    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    const mediaSrc = ctx.createMediaElementSource(audio);
    mediaSrc.connect(ctx.destination);
    await audio.play();
    audio.onended = () => URL.revokeObjectURL(url);
  } catch (err) {
    console.warn('[Voice] Playback failed:', err.message);
    URL.revokeObjectURL(url);
  }
}

export function useVoicePlayback() {
  const chunksRef   = useRef({}); // riderId -> Blob[]
  const mimeTypeRef = useRef({}); // riderId -> string

  // Unlock AudioContext on first touch/click (required on iOS + Android)
  useEffect(() => {
    const unlock = () => unlockAudio();
    document.addEventListener('touchstart', unlock, { once: true, passive: true });
    document.addEventListener('mousedown',  unlock, { once: true });
    return () => {
      document.removeEventListener('touchstart', unlock);
      document.removeEventListener('mousedown',  unlock);
    };
  }, []);

  useEffect(() => {
    const onIncoming = ({ riderId, mimeType }) => {
      chunksRef.current[riderId]   = [];
      mimeTypeRef.current[riderId] = mimeType || 'audio/webm';
    };

    const onChunk = ({ riderId, chunk }) => {
      if (!chunksRef.current[riderId]) chunksRef.current[riderId] = [];
      chunksRef.current[riderId].push(new Blob([chunk]));
    };

    const onEnded = ({ riderId }) => {
      const chunks   = chunksRef.current[riderId]   ?? [];
      const mimeType = mimeTypeRef.current[riderId] ?? 'audio/webm';
      delete chunksRef.current[riderId];
      delete mimeTypeRef.current[riderId];
      if (chunks.length === 0) return;

      const blob = new Blob(chunks, { type: mimeType });
      playBlob(blob);
    };

    socket.on('voice:incoming', onIncoming);
    socket.on('voice:chunk',    onChunk);
    socket.on('voice:ended',    onEnded);

    // P2P voice — same pipeline, triggered by webrtcMesh callbacks
    webrtcMesh.onVoiceStart = (riderId, mimeType) => onIncoming({ riderId, mimeType });
    webrtcMesh.onVoiceChunk = (riderId, buffer)   => onChunk({ riderId, chunk: buffer });
    webrtcMesh.onVoiceEnd   = (riderId)            => onEnded({ riderId });

    return () => {
      socket.off('voice:incoming', onIncoming);
      socket.off('voice:chunk',    onChunk);
      socket.off('voice:ended',    onEnded);
      webrtcMesh.onVoiceStart = null;
      webrtcMesh.onVoiceChunk = null;
      webrtcMesh.onVoiceEnd   = null;
    };
  }, []);
}
