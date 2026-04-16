require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
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

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

app.use('/api/rides',     require('./routes/rides'));
app.use('/api/sos',       require('./routes/sos'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/geocode',   require('./routes/geocode'));
app.use('/api/maps',      require('./routes/mapsProxy'));
app.use('/api/social',    require('./routes/social'));

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

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
