const express   = require('express');
const router    = express.Router();
const ApiUsage  = require('../models/ApiUsage');

// ── Pricing (USD per single API call) ────────────────────────────────────────
const COST = {
  autocomplete: 0.00283,  // Places Autocomplete — $2.83 / 1 000
  details:      0.017,    // Places Details       — $17.00 / 1 000
  directions:   0.005,    // Directions Basic     — $5.00  / 1 000
};
const MONTHLY_CAP = 190; // $190 hard cap; leaves ~$10 for client-side map loads

// ── Helpers ──────────────────────────────────────────────────────────────────

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function getOrCreateUsage() {
  const month = currentMonth();
  return ApiUsage.findOneAndUpdate(
    { month },
    { $setOnInsert: { month } },
    { upsert: true, new: true },
  );
}

async function trackAndCheck(type) {
  const month = currentMonth();
  const usage = await ApiUsage.findOneAndUpdate(
    { month },
    {
      $inc: { [type]: 1, estimatedCost: COST[type] ?? 0 },
      $set: { updatedAt: new Date() },
      $setOnInsert: { month },
    },
    { upsert: true, new: true },
  );
  // Flip fallbackMode on when cap is reached
  if (!usage.fallbackMode && usage.estimatedCost >= MONTHLY_CAP) {
    await ApiUsage.updateOne({ month }, { fallbackMode: true });
    console.warn(`[Maps] $${MONTHLY_CAP} cap reached — fallback mode activated`);
    return { ...usage.toObject(), fallbackMode: true };
  }
  return usage;
}

// ── GET /api/maps/status ──────────────────────────────────────────────────────
router.get('/status', async (_req, res) => {
  try {
    const u = await getOrCreateUsage();
    res.json({ fallbackMode: u.fallbackMode, estimatedCost: u.estimatedCost });
  } catch { res.json({ fallbackMode: false, estimatedCost: 0 }); }
});

// ── GET /api/maps/autocomplete?q= ────────────────────────────────────────────
router.get('/autocomplete', async (req, res) => {
  const q   = (req.query.q ?? '').trim();
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!q) return res.json([]);

  try {
    const usage = await getOrCreateUsage();
    if (usage.fallbackMode || !key) return nominatimFallback(q, res);

    await trackAndCheck('autocomplete');

    const r    = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&key=${key}&language=en`);
    const data = await r.json();

    if (data.status === 'OK') {
      return res.json(data.predictions.map((p) => ({
        place_id:       p.place_id,
        description:    p.description,
        main_text:      p.structured_formatting?.main_text      ?? p.description,
        secondary_text: p.structured_formatting?.secondary_text ?? '',
      })));
    }

    console.warn('[Maps autocomplete]', data.status, data.error_message);
    return nominatimFallback(q, res);
  } catch (err) {
    console.error('[Maps autocomplete]', err.message);
    return nominatimFallback(q, res);
  }
});

// ── GET /api/maps/details?placeId= ───────────────────────────────────────────
router.get('/details', async (req, res) => {
  const placeId = req.query.placeId;
  const key     = process.env.GOOGLE_MAPS_API_KEY;
  if (!placeId) return res.status(400).json({ error: 'placeId required' });

  try {
    const usage = await getOrCreateUsage();
    if (usage.fallbackMode || !key) return res.status(503).json({ error: 'fallback_mode' });

    await trackAndCheck('details');

    const r    = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${key}`);
    const data = await r.json();

    if (data.status === 'OK') {
      const { lat, lng } = data.result.geometry.location;
      return res.json({ lat, lng });
    }

    res.status(404).json({ error: data.status });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── POST /api/maps/directions  { origin:{lat,lng}, destination:{lat,lng} } ───
router.post('/directions', async (req, res) => {
  const { origin, destination } = req.body ?? {};
  const key = process.env.GOOGLE_MAPS_API_KEY;

  if (!origin?.lat || !destination?.lat) {
    return res.status(400).json({ error: 'origin and destination required' });
  }

  try {
    const usage = await getOrCreateUsage();
    if (usage.fallbackMode || !key) return osrmFallback(origin, destination, res);

    await trackAndCheck('directions');

    const orig = `${origin.lat},${origin.lng}`;
    const dest = `${destination.lat},${destination.lng}`;
    const r    = await fetch(`https://maps.googleapis.com/maps/api/directions/json?origin=${orig}&destination=${dest}&key=${key}&mode=driving`);
    const data = await r.json();

    if (data.status === 'OK') {
      const route = data.routes[0];
      const leg   = route.legs[0];
      return res.json({
        polyline:    decodePolyline(route.overview_polyline.points),
        steps:       leg.steps.map((s) => ({
          instruction: s.html_instructions.replace(/<[^>]*>/g, ''),
          distance:    s.distance.value,
          duration:    s.duration.value,
          lat:         s.start_location.lat,
          lng:         s.start_location.lng,
          maneuver:    s.maneuver ?? '',
        })),
        distance:    leg.distance.value,
        duration:    leg.duration.value,
        destination: { lat: leg.end_location.lat, lng: leg.end_location.lng },
        source:      'google',
      });
    }

    console.warn('[Maps directions]', data.status);
    return osrmFallback(origin, destination, res);
  } catch (err) {
    console.error('[Maps directions]', err.message);
    return osrmFallback(origin, destination, res);
  }
});

// ── Fallbacks ─────────────────────────────────────────────────────────────────

async function nominatimFallback(q, res) {
  try {
    const r    = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6`, { headers: { 'User-Agent': 'BikerSync/1.0' } });
    const data = await r.json();
    res.json(data.map((p) => ({
      place_id:       null,
      description:    p.display_name,
      main_text:      p.display_name.split(',')[0].trim(),
      secondary_text: p.display_name.split(',').slice(1).join(',').trim(),
      _lat:           parseFloat(p.lat),
      _lng:           parseFloat(p.lon),
    })));
  } catch { res.json([]); }
}

async function osrmFallback(origin, destination, res) {
  try {
    const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const r      = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`);
    const data   = await r.json();
    if (data.code !== 'Ok') throw new Error(data.message);
    const route  = data.routes[0];
    res.json({
      polyline:    route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      steps:       route.legs.flatMap((leg) => leg.steps.map((s) => ({
        instruction: formatOsrm(s),
        distance:    s.distance,
        duration:    s.duration,
        lat:         s.intersections[0].location[1],
        lng:         s.intersections[0].location[0],
        maneuver:    s.maneuver?.type ?? '',
      }))),
      distance:    route.distance,
      duration:    route.duration,
      destination: { lat: destination.lat, lng: destination.lng },
      source:      'osrm',
    });
  } catch (err) { res.status(502).json({ error: err.message }); }
}

function formatOsrm(s) {
  const { type, modifier } = s.maneuver;
  const road = s.name ? ` onto ${s.name}` : '';
  if (type === 'depart')     return `Head ${modifier ?? ''}${road}`;
  if (type === 'arrive')     return 'You have arrived';
  if (type === 'turn')       return `Turn ${modifier ?? ''}${road}`;
  if (type === 'roundabout') return `Enter roundabout${road}`;
  return `Continue${road}`;
}

// Google Encoded Polyline decoder
function decodePolyline(enc) {
  const pts = []; let i = 0, lat = 0, lng = 0;
  while (i < enc.length) {
    let b, sh = 0, r = 0;
    do { b = enc.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
    lat += (r & 1) ? ~(r >> 1) : (r >> 1); sh = 0; r = 0;
    do { b = enc.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20);
    lng += (r & 1) ? ~(r >> 1) : (r >> 1);
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}

module.exports = router;
