// WebRTC peer mesh — GPS, chat, SOS, and PTT voice over DataChannels.
//
// PRIMARY path  : all events go via Socket.io server when connected.
// FALLBACK path : when offline (hotspot mode), everything flows P2P.
//
// DataChannel message format
//   JSON text  : { type: 'gps'|'chat'|'sos'|'voice_start'|'voice_end'|'rtc_relay', ...payload }
//   ArrayBuffer: raw audio chunk (voice_chunk) — identified by typeof data !== 'string'
//
// Initiator rule: lexicographically smaller riderId sends the offer.

import { socket } from './socket';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const RELAY_TTL = 4;

class WebRTCMesh {
  constructor() {
    this._peers    = new Map(); // riderId -> RTCPeerConnection
    this._channels = new Map(); // riderId -> RTCDataChannel
    this._rideId   = null;
    this._selfId   = null;

    // Callbacks — set by consumers
    this.onGPS         = null; // (riderId, update) => void
    this.onPeerChange  = null; // () => void
    this.onChat        = null; // (message) => void
    this.onSOS         = null; // (payload) => void
    this.onVoiceStart  = null; // (riderId, mimeType) => void
    this.onVoiceChunk  = null; // (riderId, ArrayBuffer) => void
    this.onVoiceEnd    = null; // (riderId) => void
    // Set by useRideSession to route signals via RTDB when socket is offline.
    // This is the critical path that makes WebRTC work on mobile data.
    this.fallbackSignal = null; // (toRiderId, signal) => void
  }

  // ── Public API ────────────────────────────────────────────────────────────

  init(rideId, selfRiderId) {
    this._rideId = rideId;
    this._selfId = selfRiderId;
  }

  onSnapshot(riders) {
    // On every snapshot, retire any peer whose DataChannel isn't open (failed/pending).
    // Open DataChannels are left untouched — they're live P2P links.
    for (const riderId of [...this._peers.keys()]) {
      const dc = this._channels.get(riderId);
      if (!dc || dc.readyState !== 'open') this._destroyPeer(riderId);
    }
    for (const rider of riders) {
      if (rider.riderId !== this._selfId) this._maybeConnect(rider.riderId);
    }
  }

  onRiderJoined(riderId) {
    if (riderId !== this._selfId) this._maybeConnect(riderId);
  }

  onRiderLeft(riderId) {
    this._destroyPeer(riderId);
    this.onPeerChange?.();
  }

  async handleSignal(fromRiderId, signal) {
    try {
      if (signal.type === 'offer')  return await this._handleOffer(fromRiderId, signal);
      if (signal.type === 'answer') return await this._handleAnswer(fromRiderId, signal);
      if ('candidate' in signal)    return await this._handleIce(fromRiderId, signal);
    } catch (err) {
      console.warn('[WebRTC] signal error:', err.message);
    }
  }

  // ── Broadcast helpers — called by components when socket is offline ───────

  broadcastGPS(update) {
    this._broadcastJSON({ type: 'gps', ...update });
  }

  broadcastChat(message) {
    this._broadcastJSON({ type: 'chat', message });
  }

  broadcastSOS(payload) {
    this._broadcastJSON({ type: 'sos', payload });
  }

  broadcastVoiceStart(mimeType) {
    this._broadcastJSON({ type: 'voice_start', mimeType });
  }

  broadcastVoiceChunk(arrayBuffer) {
    for (const [, dc] of this._channels) {
      if (dc.readyState === 'open') {
        try { dc.send(arrayBuffer); } catch {}
      }
    }
  }

  broadcastVoiceEnd() {
    this._broadcastJSON({ type: 'voice_end' });
  }

  _broadcastJSON(obj) {
    const msg = JSON.stringify(obj);
    for (const [, dc] of this._channels) {
      if (dc.readyState === 'open') {
        try { dc.send(msg); } catch {}
      }
    }
  }

  // ── Peer counts ───────────────────────────────────────────────────────────

  get activePeerCount() {
    let n = 0;
    for (const [, dc] of this._channels) {
      if (dc.readyState === 'open') n++;
    }
    return n;
  }

  get connectingPeerCount() {
    return this._peers.size;
  }

  // ── Teardown ──────────────────────────────────────────────────────────────

  destroy() {
    for (const riderId of [...this._peers.keys()]) this._destroyPeer(riderId);
    this._rideId      = null;
    this._selfId      = null;
    this.onGPS        = null;
    this.onPeerChange = null;
    this.onChat       = null;
    this.onSOS        = null;
    this.onVoiceStart = null;
    this.onVoiceChunk = null;
    this.onVoiceEnd   = null;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _maybeConnect(riderId) {
    if (!this._selfId || this._peers.has(riderId)) return;
    if (this._selfId < riderId) this._createOffer(riderId);
  }

  _newPC(riderId) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this._signal(riderId, candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this._destroyPeer(riderId);
        this.onPeerChange?.();
      }
      if (pc.connectionState === 'connected') this.onPeerChange?.();
    };

    this._peers.set(riderId, pc);
    this.onPeerChange?.(); // surface "connecting" state immediately
    return pc;
  }

  async _createOffer(riderId) {
    const pc = this._newPC(riderId);
    const dc = pc.createDataChannel('bs', { ordered: false, maxRetransmits: 0 });
    this._setupDC(riderId, dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this._signal(riderId, { type: offer.type, sdp: offer.sdp });
  }

  async _handleOffer(fromId, offer) {
    if (this._peers.has(fromId)) return;
    const pc = this._newPC(fromId);
    pc.ondatachannel = ({ channel }) => this._setupDC(fromId, channel);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this._signal(fromId, { type: answer.type, sdp: answer.sdp });
  }

  async _handleAnswer(fromId, answer) {
    const pc = this._peers.get(fromId);
    if (!pc || pc.signalingState !== 'have-local-offer') return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async _handleIce(fromId, candidate) {
    const pc = this._peers.get(fromId);
    if (!pc) return;
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  }

  _setupDC(riderId, dc) {
    this._channels.set(riderId, dc);
    dc.binaryType = 'arraybuffer'; // receive voice chunks as ArrayBuffer

    dc.onopen = () => {
      console.log(`[WebRTC] P2P connected to ${riderId}`);
      this.onPeerChange?.();
    };

    dc.onclose = () => {
      this._channels.delete(riderId);
      this.onPeerChange?.();
    };

    dc.onmessage = ({ data }) => {
      // ArrayBuffer = raw voice chunk
      if (data instanceof ArrayBuffer) {
        this.onVoiceChunk?.(riderId, data);
        return;
      }
      try {
        const msg = JSON.parse(data);
        switch (msg.type) {
          case 'gps':
            if (this.onGPS) {
              const { type: _, ...update } = msg;
              this.onGPS(riderId, update);
            }
            break;
          case 'chat':        this.onChat?.(msg.message);                  break;
          case 'sos':         this.onSOS?.(msg.payload);                   break;
          case 'voice_start': this.onVoiceStart?.(riderId, msg.mimeType);  break;
          case 'voice_end':   this.onVoiceEnd?.(riderId);                  break;
          case 'rtc_relay':   this._onRelayMessage(msg, riderId);          break;
        }
      } catch {}
    };
  }

  // ── Relay signaling (hotspot offline mode) ────────────────────────────────

  _signal(toRiderId, signal) {
    if (socket.connected) {
      socket.emit('webrtc:signal', { to: toRiderId, signal });
    } else if (this.fallbackSignal) {
      this.fallbackSignal(toRiderId, signal); // RTDB path — works on all mobile networks
    } else {
      this._relayViaDataChannels(toRiderId, this._selfId, signal, RELAY_TTL, null);
    }
  }

  _relayViaDataChannels(to, from, signal, ttl, inboundPeerId) {
    const msg = JSON.stringify({ type: 'rtc_relay', to, from, signal, ttl });
    for (const [peerId, dc] of this._channels) {
      if (peerId !== inboundPeerId && dc.readyState === 'open') {
        try { dc.send(msg); } catch {}
      }
    }
  }

  _onRelayMessage({ to, from, signal, ttl }, inboundPeerId) {
    if (to === this._selfId) {
      this.handleSignal(from, signal);
      return;
    }
    if (!ttl || ttl <= 0) return;
    if (socket.connected) {
      socket.emit('webrtc:signal', { to, from, signal });
    } else {
      this._relayViaDataChannels(to, from, signal, ttl - 1, inboundPeerId);
    }
  }

  _destroyPeer(riderId) {
    try { this._channels.get(riderId)?.close(); } catch {}
    try { this._peers.get(riderId)?.close();    } catch {}
    this._channels.delete(riderId);
    this._peers.delete(riderId);
  }
}

export const webrtcMesh = new WebRTCMesh();
