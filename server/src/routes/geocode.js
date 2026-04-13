const express = require('express');
const router  = express.Router();

router.get('/', async (req, res) => {
  const q   = (req.query.q ?? '').trim();
  const key = process.env.OPENCAGE_API_KEY;

  if (!q) return res.json([]);

  // Fall back to Nominatim if no key configured yet
  if (!key) {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6`,
        { headers: { 'User-Agent': 'BikerSync/1.0', 'Accept-Language': 'en' } },
      );
      const data = await r.json();
      return res.json(data.map((p) => ({
        label: p.display_name,
        lat:   parseFloat(p.lat),
        lng:   parseFloat(p.lon),
      })));
    } catch {
      return res.status(502).json({ error: 'Geocoding unavailable' });
    }
  }

  // OpenCage Geocoding API
  try {
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(q)}&key=${key}&limit=6&no_annotations=1&language=en`;
    const r    = await fetch(url);
    const data = await r.json();

    if (data.status?.code === 401) {
      return res.status(403).json({ error: 'OpenCage API key invalid' });
    }
    if (data.status?.code === 429) {
      return res.status(429).json({ error: 'Geocoding daily limit reached' });
    }

    const results = (data.results ?? []).map((p) => ({
      label: p.formatted,
      lat:   p.geometry.lat,
      lng:   p.geometry.lng,
    }));
    res.json(results);
  } catch (err) {
    console.error('[Geocode]', err.message);
    res.status(502).json({ error: 'Geocoding request failed' });
  }
});

module.exports = router;
