import { useEffect, useRef } from 'react';
import { socket } from '../services/socket';
import { webrtcMesh } from '../services/webrtcMesh';
import { wifiDirectMesh } from '../services/wifiDirectMesh';

let _audioCtx = null;

async function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') await _audioCtx.resume();
  return _audioCtx;
}

export function unlockAudio() { getAudioCtx(); }

// Play a Blob of compressed audio (WebM/Opus from browser MediaRecorder)
async function playBlob(blob) {
  const ctx = await getAudioCtx();
  try {
    const buf     = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf);
    const src     = ctx.createBufferSource();
    src.buffer    = decoded;
    src.connect(ctx.destination);
    src.start(0);
    return;
  } catch {}
  // Fallback: HTMLAudioElement through AudioContext
  try {
    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    const mediaSrc = ctx.createMediaElementSource(audio);
    mediaSrc.connect(ctx.destination);
    await audio.play();
    audio.onended = () => URL.revokeObjectURL(url);
  } catch (err) {
    console.warn('[Voice] Blob playback failed:', err.message);
  }
}

// Play accumulated base64 PCM16 chunks (from native VoicePlugin @ 16 kHz mono)
async function playPCM16Chunks(b64Chunks) {
  if (b64Chunks.length === 0) return;
  try {
    const ctx = await getAudioCtx();

    // Decode all base64 chunks into a single Int16 buffer
    let totalSamples = 0;
    const int16Arrays = b64Chunks.map((b64) => {
      const raw   = atob(b64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const i16 = new Int16Array(bytes.buffer);
      totalSamples += i16.length;
      return i16;
    });

    const float32 = new Float32Array(totalSamples);
    let offset = 0;
    for (const i16 of int16Arrays) {
      for (let i = 0; i < i16.length; i++) {
        float32[offset++] = i16[i] / 32768;
      }
    }

    const buffer = ctx.createBuffer(1, float32.length, 16000);
    buffer.copyToChannel(float32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
  } catch (err) {
    console.warn('[Voice] PCM playback failed:', err.message);
  }
}

export function useVoicePlayback() {
  const blobChunksRef = useRef({}); // riderId → Blob[]
  const pcmChunksRef  = useRef({}); // riderId → string[] (base64)
  const mimeTypeRef   = useRef({}); // riderId → string

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
      blobChunksRef.current[riderId] = [];
      pcmChunksRef.current[riderId]  = [];
      mimeTypeRef.current[riderId]   = mimeType || 'audio/webm';
    };

    const onChunk = ({ riderId, chunk }) => {
      if (typeof chunk === 'string') {
        // Native path: base64-encoded PCM16 from VoicePlugin
        if (!pcmChunksRef.current[riderId]) pcmChunksRef.current[riderId] = [];
        pcmChunksRef.current[riderId].push(chunk);
      } else {
        // Browser path: binary blob from MediaRecorder
        if (!blobChunksRef.current[riderId]) blobChunksRef.current[riderId] = [];
        blobChunksRef.current[riderId].push(new Blob([chunk]));
      }
    };

    const onEnded = ({ riderId }) => {
      const pcm      = pcmChunksRef.current[riderId]  ?? [];
      const blobs    = blobChunksRef.current[riderId] ?? [];
      const mimeType = mimeTypeRef.current[riderId]   ?? 'audio/webm';
      delete pcmChunksRef.current[riderId];
      delete blobChunksRef.current[riderId];
      delete mimeTypeRef.current[riderId];

      if (pcm.length > 0) {
        playPCM16Chunks(pcm);
      } else if (blobs.length > 0) {
        playBlob(new Blob(blobs, { type: mimeType }));
      }
    };

    socket.on('voice:incoming', onIncoming);
    socket.on('voice:chunk',    onChunk);
    socket.on('voice:ended',    onEnded);

    webrtcMesh.onVoiceStart = (riderId, mimeType) => onIncoming({ riderId, mimeType });
    webrtcMesh.onVoiceChunk = (riderId, buffer)   => onChunk({ riderId, chunk: buffer });
    webrtcMesh.onVoiceEnd   = (riderId)            => onEnded({ riderId });

    // WiFi Direct path — PCM16 chunks arrive as base64 strings
    wifiDirectMesh.onVoiceStart = (riderId, mimeType) => onIncoming({ riderId, mimeType });
    wifiDirectMesh.onVoiceChunk = (riderId, b64)      => onChunk({ riderId, chunk: b64 });
    wifiDirectMesh.onVoiceEnd   = (riderId)            => onEnded({ riderId });

    return () => {
      socket.off('voice:incoming', onIncoming);
      socket.off('voice:chunk',    onChunk);
      socket.off('voice:ended',    onEnded);
      webrtcMesh.onVoiceStart = null;
      webrtcMesh.onVoiceChunk = null;
      webrtcMesh.onVoiceEnd   = null;
      wifiDirectMesh.onVoiceStart = null;
      wifiDirectMesh.onVoiceChunk = null;
      wifiDirectMesh.onVoiceEnd   = null;
    };
  }, []);
}
