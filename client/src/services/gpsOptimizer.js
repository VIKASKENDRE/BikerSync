import { Capacitor, registerPlugin } from '@capacitor/core';

const FAST_INTERVAL    = 3000;   // 3 s when riding
const SLOW_INTERVAL    = 15000;  // 15 s when stationary
const MIN_DISTANCE_M   = 10;     // ignore micro-jitter under 10 m
const MAX_ACCURACY_M   = 40;     // reject readings with accuracy worse than 40 m
const MAX_SPEED_MS     = 70;     // ~250 km/h — reject teleports above this

const IS_NATIVE = Capacitor.isNativePlatform();
// BackgroundLocation plugin — only available on native Android/iOS.
// registerPlugin is a no-op on web and returns a safe stub.
const BgLocation = IS_NATIVE ? registerPlugin('BackgroundLocation') : null;

export class GPSOptimizer {
  constructor(onUpdate) {
    this.onUpdate  = onUpdate;
    this.watchId   = null;      // used on web
    this._listener = null;      // used on native
    this.lastEmit  = { lat: null, lng: null, time: 0 };
    this.lastGood  = null;
  }

  start() {
    if (IS_NATIVE && BgLocation) {
      this._startNative();
    } else {
      this._startWeb();
    }
  }

  stop() {
    if (IS_NATIVE && BgLocation) {
      this._stopNative();
    } else {
      this._stopWeb();
    }
  }

  // ── Native path (Android foreground service) ──────────────────────────────

  _startNative() {
    BgLocation.start().catch((err) => {
      console.warn('[GPS] Background service failed, falling back to web API:', err);
      this._startWeb();
    });

    BgLocation.addListener('location', (pos) => {
      this._handle({
        coords: {
          latitude:  pos.lat,
          longitude: pos.lng,
          speed:     pos.speed,   // m/s, -1 if unavailable
          heading:   pos.heading,
          accuracy:  pos.accuracy,
        },
      });
    }).then((handle) => {
      this._listener = handle;
    });
  }

  _stopNative() {
    this._listener?.remove();
    this._listener = null;
    BgLocation?.stop().catch(() => {});
  }

  // ── Web path (browser Geolocation API) ───────────────────────────────────

  _startWeb() {
    if (!navigator.geolocation) throw new Error('Geolocation not supported');
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this._handle(pos),
      (err)  => console.warn('[GPS]', err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
    );
  }

  _stopWeb() {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  // ── Shared filtering + emit logic ─────────────────────────────────────────

  async _handle(pos) {
    const { latitude: lat, longitude: lng, speed, heading, accuracy } = pos.coords;
    const now = Date.now();

    // 1. Accuracy gate — discard noisy fixes
    if (accuracy > MAX_ACCURACY_M) return;

    // 2. Sanity check — discard teleports
    if (this.lastGood) {
      const dist = haversineMeters(this.lastGood.lat, this.lastGood.lng, lat, lng);
      const dt   = (now - this.lastGood.time) / 1000;
      if (dt > 0 && dist / dt > MAX_SPEED_MS) return;
    }

    // 3. Derive speed from position delta when GPS speed is unavailable
    let speedKmh = (speed != null && speed >= 0) ? speed * 3.6 : -1;
    if (speedKmh < 0 && this.lastGood) {
      const dist = haversineMeters(this.lastGood.lat, this.lastGood.lng, lat, lng);
      const dt   = (now - this.lastGood.time) / 1000;
      speedKmh   = dt > 0 ? (dist / dt) * 3.6 : 0;
    }
    if (speedKmh < 0) speedKmh = 0;

    // 4. Rate limiting
    const interval = speedKmh > 5 ? FAST_INTERVAL : SLOW_INTERVAL;
    if (now - this.lastEmit.time < interval) {
      this.lastGood = { lat, lng, time: now };
      return;
    }

    // 5. Minimum-distance gate
    if (
      this.lastEmit.lat != null &&
      haversineMeters(this.lastEmit.lat, this.lastEmit.lng, lat, lng) < MIN_DISTANCE_M &&
      now - this.lastEmit.time < SLOW_INTERVAL
    ) {
      this.lastGood = { lat, lng, time: now };
      return;
    }

    this.lastEmit = { lat, lng, time: now };
    this.lastGood = { lat, lng, time: now };

    // 6. Battery
    let battery = null;
    if ('getBattery' in navigator) {
      try { battery = Math.round((await navigator.getBattery()).level * 100); } catch {}
    }

    this.onUpdate({
      lat, lng,
      speed:    Math.round(speedKmh),
      heading:  Math.round(heading ?? 0),
      accuracy: Math.round(accuracy),
      battery,
    });
  }
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R    = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
