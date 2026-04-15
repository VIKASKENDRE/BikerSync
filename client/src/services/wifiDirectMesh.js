/**
 * wifiDirectMesh.js
 *
 * Wraps the native WifiDirect Capacitor plugin.
 *
 * Transport priority in useRideSession:
 *   1. Socket.io  (internet up)
 *   2. WebRTC DataChannels  (hotspot)
 *   3. WiFi Direct TCP mesh  (fully offline, APK only, ~200 m range)
 *
 * Connection strategy (Android 10+):
 *   LEAD calls createGroup(rideId) → creates a WifiP2p group with a deterministic
 *   SSID/passphrase derived from the ride ID.
 *
 *   Non-LEAD calls startDiscovery(rideId) → calls connectToGroup() with the same
 *   SSID/passphrase. Android shows ONE system popup ("Connect to BikerSync ride?").
 *   After the user taps Connect, the process binds to the network and TCP auto-connects
 *   to 192.168.49.1:8765 with retries.
 *
 * Message wire format (JSON, newline-delimited over TCP):
 *   { type, riderId, ...payload }
 */

import { Capacitor } from '@capacitor/core';
import WifiDirect from './wifiDirect';

const IS_NATIVE = Capacitor.isNativePlatform();

// Derive a stable SSID and passphrase from the ride ID — same logic as the Kotlin plugin.
function groupCredentials(rideId) {
  const ssid       = `DIRECT-BikerSync-${rideId.slice(0, 4)}`;
  const passphrase = `bsync${rideId}`.padEnd(8, '0').slice(0, 32);
  return { ssid, passphrase };
}

class WifiDirectMesh {
  constructor() {
    this._initialized     = false;
    this._isGroupOwner    = false;
    this._peerCount       = 0;
    this._selfRiderId     = null;
    this._listeners       = [];
    this._discoveredPeers = [];
    this.groupSsid        = '';    // set after createGroup() resolves
    this.groupPassphrase  = '';

    this.onGPS             = null;
    this.onChat            = null;
    this.onSOS             = null;
    this.onVoiceStart      = null;
    this.onVoiceChunk      = null;
    this.onVoiceEnd        = null;
    this.onPeerChange      = null;
    this.onPeersDiscovered = null;
    this.onGroupReady      = null; // (ssid, passphrase) => void
  }

  get isAvailable() { return IS_NATIVE; }
  get isActive()    { return this._initialized && this._peerCount > 0; }
  get peerCount()   { return this._peerCount; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async init(selfRiderId) {
    if (!IS_NATIVE) return;
    this._selfRiderId = selfRiderId;
    if (this._initialized) return;

    await WifiDirect.initialize();

    const add = (event, handler) =>
      WifiDirect.addListener(event, handler).then(l => this._listeners.push(l));

    await add('messageReceived', ({ message }) => this._handleMessage(message));

    // GO side: TCP client connected → increment peer count
    await add('peerCountChanged', ({ count }) => {
      this._peerCount = count;
      this.onPeerChange?.();
    });

    // Both sides: TCP connection established → this is when messaging is live.
    // We rely on tcpConnected (not connectionChanged) so _peerCount only goes to 1
    // once the socket is actually open.
    await add('tcpConnected', ({ role }) => {
      if (role === 'client') {
        // Non-GO: connected to GO via TCP
        this._peerCount = 1;
        this.onPeerChange?.();
      }
      // GO side is handled by peerCountChanged above
    });

    // WiFi P2P state change — inform UI but don't update _peerCount yet
    // (TCP may not be open). connectionChanged is still used for the legacy
    // connect() path (Android 9 and below, or manual connect from Settings).
    await add('groupInfoReady', ({ ssid, passphrase }) => {
      this.groupSsid       = ssid       ?? '';
      this.groupPassphrase = passphrase ?? '';
      this.onGroupReady?.(this.groupSsid, this.groupPassphrase);
    });

    await add('connectionChanged', ({ connected, isGroupOwner }) => {
      if (!connected) {
        this._peerCount = 0;
        this.onPeerChange?.();
      } else {
        this._isGroupOwner = isGroupOwner;
      }
    });

    // Legacy discovery results (fallback when connectToGroup isn't available)
    await add('peersChanged', ({ peers }) => {
      this._discoveredPeers = peers ?? [];
      this.onPeersDiscovered?.(this._discoveredPeers);
      // Legacy fallback auto-connect (Android 9 or if connectToGroup failed)
      if (!this._isGroupOwner && this._peerCount === 0 && peers?.length > 0) {
        WifiDirect.connect({ address: peers[0].address }).catch(() => {});
      }
    });

    this._initialized = true;
  }

  /**
   * Call for the ride LEAD — creates a deterministic WiFi Direct group.
   * The LEAD becomes the Group Owner (GO) and TCP relay server.
   */
  async createGroup(selfRiderId, rideId) {
    if (!IS_NATIVE) return;
    await this.init(selfRiderId);
    const result = await WifiDirect.createGroup({ rideId: rideId ?? '' });
    this._isGroupOwner   = true;
    this.groupSsid       = result?.ssid       ?? groupCredentials(rideId ?? '').ssid;
    this.groupPassphrase = result?.passphrase ?? groupCredentials(rideId ?? '').passphrase;
    this.onGroupReady?.(this.groupSsid, this.groupPassphrase);
  }

  /**
   * Call for non-LEAD riders.
   * On Android 10+: uses WifiNetworkSpecifier to connect directly to the
   * LEAD's group — shows ONE system dialog ("Connect to BikerSync ride?").
   * On Android 9 / fallback: falls back to peer discovery + connect().
   */
  async startDiscovery(selfRiderId, rideId) {
    if (!IS_NATIVE) return;
    await this.init(selfRiderId);

    if (rideId) {
      const { ssid, passphrase } = groupCredentials(rideId);
      try {
        await WifiDirect.connectToGroup({ ssid, passphrase });
        return; // Success — TCP retry loop is running in native code
      } catch (err) {
        console.warn('[WD] connectToGroup failed, falling back to discovery:', err);
      }
    }

    // Fallback: legacy peer discovery
    await WifiDirect.startDiscovery();
  }

  async stopDiscovery() {
    if (!IS_NATIVE || !this._initialized) return;
    await WifiDirect.stopDiscovery().catch(() => {});
  }

  /**
   * Add a WifiNetworkSuggestion so Android auto-connects to the LEAD's WD
   * group in the background (API 29+).  No-op on older devices or web.
   * Safe to call multiple times — the native side removes any prior suggestion.
   */
  async suggestNetworkForRide(rideId) {
    if (!IS_NATIVE) return;
    const { ssid, passphrase } = groupCredentials(rideId);
    await WifiDirect.suggestNetwork({ ssid, passphrase }).catch((e) =>
      console.warn('[WD] suggestNetwork failed:', e)
    );
  }

  /** Remove the network suggestion when internet is back (socket reconnected). */
  async removeSuggestion() {
    if (!IS_NATIVE) return;
    await WifiDirect.removeSuggestion({}).catch(() => {});
  }

  // ── Broadcast helpers ─────────────────────────────────────────────────────

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

  // PCM16 chunks are already base64 strings from VoicePlugin — send as JSON.
  // Binary blobs (web MediaRecorder) are not supported; pass null to skip.
  broadcastVoiceChunk(pcm16b64) {
    if (typeof pcm16b64 !== 'string') return;
    this._send({ type: 'voice_chunk', riderId: this._selfRiderId, chunk: pcm16b64 });
  }

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

    this.onGPS = this.onChat = this.onSOS = null;
    this.onVoiceStart = this.onVoiceChunk = this.onVoiceEnd = null;
    this.onPeerChange = this.onPeersDiscovered = null;
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
      if (!riderId) return;

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
        case 'voice_chunk':
          this.onVoiceChunk?.(riderId, msg.chunk);
          break;
        case 'voice_end':
          this.onVoiceEnd?.(riderId);
          break;
      }
    } catch {}
  }
}

export const wifiDirectMesh = new WifiDirectMesh();
