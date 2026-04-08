const FAST_INTERVAL = 3000;  // 3s when riding
const SLOW_INTERVAL = 15000; // 15s when stationary
const MIN_DISTANCE_M = 5;

export class GPSOptimizer {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.watchId = null;
    this.lastEmit = { lat: null, lng: null, time: 0 };
  }

  start() {
    if (!navigator.geolocation) throw new Error('Geolocation not supported');

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this._handle(pos),
      (err) => console.warn('[GPS]', err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
  }

  stop() {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  async _handle(pos) {
    const { latitude: lat, longitude: lng, speed, heading, accuracy } = pos.coords;
    const now = Date.now();
    const speedKmh = (speed ?? 0) * 3.6;
    const interval = speedKmh > 10 ? FAST_INTERVAL : SLOW_INTERVAL;

    if (now - this.lastEmit.time < interval) return;

    if (
      this.lastEmit.lat != null &&
      haversineMeters(this.lastEmit.lat, this.lastEmit.lng, lat, lng) < MIN_DISTANCE_M &&
      now - this.lastEmit.time < SLOW_INTERVAL
    ) return;

    this.lastEmit = { lat, lng, time: now };

    // Read battery level if available
    let battery = null;
    if ('getBattery' in navigator) {
      try {
        const b = await navigator.getBattery();
        battery = Math.round(b.level * 100);
      } catch {}
    }

    this.onUpdate({
      lat, lng,
      speed: Math.round(speedKmh),
      heading: Math.round(heading ?? 0),
      accuracy: Math.round(accuracy),
      battery,
    });
  }
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
