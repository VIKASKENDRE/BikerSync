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

// ── PCM16 streaming (native Android path) ────────────────────────────────────
// Each base64 chunk is raw 16-bit signed PCM @ 16 kHz mono — independently
// decodable, so we schedule them back-to-back on the AudioContext timeline.
class PCM16Stream {
  constructor() {
    this.nextTime = 0;
  }

  async push(b64) {
    const ctx = await getAudioCtx();
    try {
      const raw   = atob(b64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const i16 = new Int16Array(bytes.buffer);
      const f32 = new Float32Array(i16.length);
      for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;

      const buf = ctx.createBuffer(1, f32.length, 16000);
      buf.copyToChannel(f32, 0);

      const now = ctx.currentTime;
      // Re-sync queue if we've fallen behind (gap, first chunk, or late arrival)
      if (this.nextTime < now + 0.02) this.nextTime = now + 0.06;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(this.nextTime);
      this.nextTime += buf.duration;
    } catch (e) {
      console.warn('[Voice] PCM16 chunk error:', e.message);
    }
  }
}

// ── WebM/Opus streaming (browser path) ───────────────────────────────────────
// MediaRecorder chunks are appended in order to a MediaSource SourceBuffer,
// giving true real-time playback. Falls back to accumulate-and-play on errors.
class WebMStream {
  constructor(mimeType) {
    this.mimeType      = mimeType;
    this.ms            = new MediaSource();
    this.audio         = new Audio();
    this.audio.src     = URL.createObjectURL(this.ms);
    this.sb            = null;
    this.pending       = [];   // chunks waiting for sourceopen / updateend
    this.ready         = false;
    this.failed        = false;
    this.fallback      = [];   // accumulate raw for fallback playback

    this.ms.addEventListener('sourceopen', () => {
      try {
        this.sb = this.ms.addSourceBuffer(mimeType);
        this.sb.mode = 'sequence';
        this.sb.addEventListener('updateend', () => this._drain());
        this.ready = true;
        this._drain();
      } catch (e) {
        console.warn('[Voice] MSE init failed:', e.message);
        this.failed = true;
      }
    }, { once: true });
  }

  push(arrayBuffer) {
    this.fallback.push(arrayBuffer);
    if (this.failed) return;
    this.pending.push(arrayBuffer);
    if (this.ready && !this.sb.updating) this._drain();
    if (this.audio.paused) this.audio.play().catch(() => {});
  }

  _drain() {
    if (!this.ready || this.sb.updating || this.pending.length === 0) return;
    try {
      this.sb.appendBuffer(this.pending.shift());
    } catch (e) {
      console.warn('[Voice] MSE append error:', e.message);
      this.failed = true;
    }
  }

  async playFallback() {
    if (this.fallback.length === 0) return;
    const ctx  = await getAudioCtx();
    const blob = new Blob(this.fallback.map((ab) => new Blob([ab])), { type: this.mimeType });
    try {
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      const src     = ctx.createBufferSource();
      src.buffer    = decoded;
      src.connect(ctx.destination);
      src.start(0);
    } catch {}
  }

  destroy() {
    try { if (this.ms.readyState === 'open') this.ms.endOfStream(); } catch {}
    URL.revokeObjectURL(this.audio.src);
  }
}

const MSE_SUPPORTED = typeof MediaSource !== 'undefined';

// Normalise any binary payload to ArrayBuffer
async function toArrayBuffer(chunk) {
  if (chunk instanceof ArrayBuffer)  return chunk;
  if (ArrayBuffer.isView(chunk))     return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
  if (chunk instanceof Blob)         return chunk.arrayBuffer();
  return null;
}

export function useVoicePlayback() {
  // riderId → { stream: PCM16Stream | WebMStream, isPCM16: bool, mimeType: string }
  const sendersRef = useRef({});

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
    const onIncoming = ({ riderId, mimeType = 'audio/webm' }) => {
      // Clean up any existing stream for this sender
      const prev = sendersRef.current[riderId];
      if (prev) { prev.stream?.destroy?.(); }

      const isPCM16  = mimeType.startsWith('audio/pcm16');
      const stream   = isPCM16
        ? new PCM16Stream()
        : (MSE_SUPPORTED ? new WebMStream(mimeType) : null);

      sendersRef.current[riderId] = { stream, isPCM16, mimeType };
    };

    const onChunk = async ({ riderId, chunk }) => {
      let sender = sendersRef.current[riderId];

      // voice:incoming can be missed if the receiver's socket reconnected while
      // the sender was already transmitting (common on mobile data). Bootstrap a
      // PCM16 stream on the first chunk so audio plays without a re-join.
      if (!sender && typeof chunk === 'string') {
        sender = { stream: new PCM16Stream(), isPCM16: true, mimeType: 'audio/pcm16;rate=16000' };
        sendersRef.current[riderId] = sender;
      }

      if (!sender || !sender.stream) return;

      if (sender.isPCM16) {
        // Native path: chunk is a base64 string
        if (typeof chunk === 'string') await sender.stream.push(chunk);
      } else {
        // Browser path: chunk is binary (ArrayBuffer / Uint8Array / Blob)
        const ab = await toArrayBuffer(chunk);
        if (ab) sender.stream.push(ab);
      }
    };

    const onEnded = async ({ riderId }) => {
      const sender = sendersRef.current[riderId];
      if (!sender) return;

      if (!sender.isPCM16 && sender.stream instanceof WebMStream) {
        if (sender.stream.failed) await sender.stream.playFallback();
        sender.stream.destroy();
      }
      delete sendersRef.current[riderId];
    };

    socket.on('voice:incoming', onIncoming);
    socket.on('voice:chunk',    onChunk);
    socket.on('voice:ended',    onEnded);

    webrtcMesh.onVoiceStart = (riderId, mimeType) => onIncoming({ riderId, mimeType });
    webrtcMesh.onVoiceChunk = (riderId, buffer)   => onChunk({ riderId, chunk: buffer });
    webrtcMesh.onVoiceEnd   = (riderId)            => onEnded({ riderId });

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
