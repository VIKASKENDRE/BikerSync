/**
 * wifiDirectMesh.js
 *
 * Wraps the native WifiDirect Capacitor plugin in the same callback API
 * that webrtcMesh uses so useRideSession can treat it as a drop-in transport.
 *
 * Transport priority in useRideSession:
 *   1. Socket.io  (internet up)
 *   2. WebRTC DataChannels  (hotspot, internet was available at session start)
 *   3. WiFi Direct TCP mesh  (fully offline, APK only, ~200 m range)
 *
 * Message wire format (JSON, newline-delimited over TCP):
 *   { type, riderId, ...payload }
 *   — riderId is always included because the GO relay strips sender identity.
 *
 * Topology: star.  Ride lead is always the Group Owner (GO).
 *   GO runs a TCP server on :8765.  All other riders connect as TCP clients.
 *   GO relays every message to all other connected clients.
 */

import { Capacitor } from '@capacitor/core';
import WifiDirect from './wifiDirect';

const IS_NATIVE = Capacitor.isNativePlatform();

class WifiDirectMesh {
  constructor() {
    this._initialized    = false;
    this._isGroupOwner   = false;
    this._peerCount      = 0;
    this._selfRiderId    = null;
    this._listeners      = [];
    this._discoveredPeers = [];

    // Callbacks — mirror webrtcMesh API
    this.onGPS             = null; // (riderId, update) => void
    this.onChat            = null; // (message) => void
    this.onSOS             = null; // (payload) => void
    this.onVoiceStart      = null; // (riderId, mimeType) => void
    this.onVoiceEnd        = null; // (riderId) => void
    this.onPeerChange      = null; // () => void
    this.onPeersDiscovered = null; // (peers) => void  — for optional connect UI
  }

  // ── Capabilities ──────────────────────────────────────────────────────────

  /** True only inside the Android APK — silent no-ops in browser. */
  get isAvailable() { return IS_NATIVE; }

  /** True when this device is the GO with ≥ 1 client, OR a client connected to the GO. */
  get isActive() {
    return this._initialized && this._peerCount > 0;
  }

  get peerCount() { return this._peerCount; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async init(selfRiderId) {
    if (!IS_NATIVE) return;
    this._selfRiderId = selfRiderId;
    if (this._initialized) return;

    await WifiDirect.initialize();

    const add = (event, handler) =>
      WifiDirect.addListener(event, handler).then(l => this._listeners.push(l));

    await add('messageReceived', ({ message }) => this._handleMessage(message));

    // GO-side: counts connected TCP clients
    await add('peerCountChanged', ({ count }) => {
      this._peerCount = count;
      this.onPeerChange?.();
    });

    // Client-side: fired when WiFi P2P negotiation completes
    await add('connectionChanged', ({ connected, isGroupOwner }) => {
      if (connected) {
        this._isGroupOwner = isGroupOwner;
        // Non-GO clients are connected to exactly one GO
        if (!isGroupOwner) {
          this._peerCount = 1;
          this.onPeerChange?.();
        }
      } else {
        this._peerCount = 0;
        this.onPeerChange?.();
      }
    });

    // Discovery results — surface to UI and optionally auto-connect
    await add('peersChanged', ({ peers }) => {
      this._discoveredPeers = peers ?? [];
      this.onPeersDiscovered?.(this._discoveredPeers);
      // Auto-connect to the first available peer (first one seen = ride lead's device)
      if (!this._isGroupOwner && this._peerCount === 0 && peers?.length > 0) {
        WifiDirect.connect({ address: peers[0].address }).catch(() => {});
      }
    });

    this._initialized = true;
  }

  /**
   * Call this for the ride LEAD — makes this device the Group Owner.
   * The TCP relay server starts automatically inside the plugin.
   */
  async createGroup(selfRiderId) {
    if (!IS_NATIVE) return;
    await this.init(selfRiderId);
    await WifiDirect.createGroup();
    this._isGroupOwner = true;
  }

  /**
   * Call this for non-lead riders — starts peer scanning.
   * Auto-connects to the first discovered device (see peersChanged handler above).
   */
  async startDiscovery(selfRiderId) {
    if (!IS_NATIVE) return;
    await this.init(selfRiderId);
    await WifiDirect.startDiscovery();
  }

  async stopDiscovery() {
    if (!IS_NATIVE || !this._initialized) return;
    await WifiDirect.stopDiscovery().catch(() => {});
  }

  // ── Broadcast helpers — called from useRideSession ────────────────────────

  broadcastGPS(update) {
    this._send({ type: 'gps', riderId: this._selfRiderId, ...update });
  }

  broadcastChat(message) {
    this._send({ type: 'chat', riderId: this._selfRiderId, message });
  }

  broadcastSOS(payload) {
    this._send({ type: 'sos', riderId: this._selfRiderId, payload });
  }

  broadcastVoiceStart(mimeType) {
    this._send({ type: 'voice_start', riderId: this._selfRiderId, mimeType });
  }

  broadcastVoiceEnd() {
    this._send({ type: 'voice_end', riderId: this._selfRiderId });
  }

  // Voice audio chunks are binary — not supported over the text TCP socket.
  // PTT voice falls back to WebRTC DataChannels when WiFi Direct is active.
  broadcastVoiceChunk() {}

  // ── Teardown ──────────────────────────────────────────────────────────────

  async destroy() {
    for (const l of this._listeners) {
      try { await l.remove(); } catch {}
    }
    this._listeners = [];

    if (IS_NATIVE && this._initialized) {
      await WifiDirect.stopDiscovery().catch(() => {});
      await WifiDirect.disconnect().catch(() => {});
    }

    this._initialized     = false;
    this._isGroupOwner    = false;
    this._peerCount       = 0;
    this._selfRiderId     = null;
    this._discoveredPeers = [];

    this.onGPS             = null;
    this.onChat            = null;
    this.onSOS             = null;
    this.onVoiceStart      = null;
    this.onVoiceEnd        = null;
    this.onPeerChange      = null;
    this.onPeersDiscovered = null;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _send(obj) {
    if (!IS_NATIVE || !this._initialized || this._peerCount === 0) return;
    WifiDirect.sendMessage({ message: JSON.stringify(obj) }).catch(() => {});
  }

  _handleMessage(raw) {
    try {
      const msg = JSON.parse(raw);
      const { type, riderId } = msg;
      if (!riderId) return; // malformed

      switch (type) {
        case 'gps': {
          const { type: _t, riderId: _r, ...update } = msg;
          this.onGPS?.(riderId, update);
          break;
        }
        case 'chat':
          this.onChat?.(msg.message);
          break;
        case 'sos':
          this.onSOS?.(msg.payload);
          break;
        case 'voice_start':
          this.onVoiceStart?.(riderId, msg.mimeType);
          break;
        case 'voice_end':
          this.onVoiceEnd?.(riderId);
          break;
      }
    } catch {}
  }
}

export const wifiDirectMesh = new WifiDirectMesh();
