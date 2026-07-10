require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const locationHandler = require('./sockets/locationHandler');
const chatHandler = require('./sockets/chatHandler');
const voiceHandler = require('./sockets/voiceHandler');

const app = express();
const server = http.createServer(app);

// Capacitor Android uses capacitor://localhost and https://localhost as origins
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL,
  'https://localhost',
  'capacitor://localhost',
  'http://localhost',
].filter(Boolean);

const io = new Server(server, {
  path: '/bs',           // non-default path bypasses Railway CDN's socket.io interception
  cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
  transports: ['polling', 'websocket'], // polling first so Jio/carrier proxies can connect
  pingTimeout: 20000,
  pingInterval: 10000,
});

app.set('trust proxy', 1); // Railway sits behind a proxy — needed for real client IPs
// crossOriginResourcePolicy relaxed so the Vercel/Capacitor origins can load /uploads images
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// ── Per-IP rate limits ────────────────────────────────────────────────────────
// GPS/chat/PTT ride on the socket, so REST volume per legitimate user is low.
const limiter = (windowMs, max) =>
  rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false,
              message: { error: 'Too many requests, slow down' } });
app.use('/api/maps',    limiter(5 * 60 * 1000, 60));   // Google billing exposure
app.use('/api/geocode', limiter(5 * 60 * 1000, 60));
app.use('/api/sos',     limiter(10 * 60 * 1000, 10));  // spam guard; generous for real emergencies
app.use('/api/',        limiter(5 * 60 * 1000, 300));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
// nosniff + CSP so an upload can never execute as HTML/JS on this origin
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
  },
}));

app.use('/api/rides',     require('./routes/rides'));
app.use('/api/sos',       require('./routes/sos'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/geocode',   require('./routes/geocode'));
app.use('/api/maps',      require('./routes/mapsProxy'));
app.use('/api/social',    require('./routes/social'));

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ── ICE server credentials for WebRTC TURN ────────────────────────────────────
// Set METERED_API_URL in Railway env to use your own Metered.ca account.
// Falls back to the free OpenRelay public TURN (ok for dev / small scale).
let _iceCache = null;
let _iceCacheExpiry = 0;
app.get('/api/ice-servers', async (req, res) => {
  const now = Date.now();
  if (_iceCache && now < _iceCacheExpiry) return res.json(_iceCache);
  if (process.env.METERED_API_URL) {
    try {
      const r = await fetch(process.env.METERED_API_URL);
      if (r.ok) {
        _iceCache = await r.json();
        _iceCacheExpiry = now + 3_600_000; // cache 1 hour
        return res.json(_iceCache);
      }
    } catch {}
  }
  // Public OpenRelay fallback — free, no signup, ~50 GB/month shared
  res.json([
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username:   'openrelayproject',
      credential: 'openrelayproject',
    },
  ]);
});

io.use(require('./middleware/socketAuth'));

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);
  locationHandler(io, socket);
  chatHandler(io, socket);
  voiceHandler(io, socket);
  socket.on('disconnect', () => console.log(`[Socket] Disconnected: ${socket.id}`));
});

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('[DB] MongoDB connected');
    server.listen(process.env.PORT || 4000, () =>
      console.log(`[Server] BikerSync running on :${process.env.PORT || 4000}`)
    );
  })
  .catch((err) => {
    console.error('[DB] Connection failed:', err.message);
    console.log('[Server] Starting without DB (limited functionality)');
    server.listen(process.env.PORT || 4000, () =>
      console.log(`[Server] BikerSync running on :${process.env.PORT || 4000}`)
    );
  });
