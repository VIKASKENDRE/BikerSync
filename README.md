# BikerSync

Real-time motorcycle group ride coordination app. Stay together, ride safe.

![BikerSync](https://img.shields.io/badge/platform-web-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **Live GPS Tracking** — see every rider's position on a dark map in real time
- **Push-to-Talk Voice** — hold to transmit, release to broadcast to the group
- **Group Chat** — text messaging within the ride
- **SOS Alert** — hold 2 seconds to broadcast an emergency to all riders with your location
- **Role System** — Lead, Sweep, and Rider roles with colour-coded badges
- **Offline / Hotspot Mode** — GPS, chat, PTT, and SOS all continue working without internet via WebRTC P2P DataChannels
- **Session Persistence** — rejoin your ride after a page refresh without re-entering details
- **Battery & Speed Display** — live telemetry in the HUD

---

## How It Works

```
Online mode:   Phone → Socket.io (Railway) → All riders
Offline mode:  Phone → WebRTC DataChannel (P2P over LAN) → All riders
```

When all riders have internet, everything flows through the server. When the group is on a shared hotspot and loses mobile data, the app automatically switches to peer-to-peer via WebRTC DataChannels — no configuration needed. Once the **P2P·N** green pill appears in the HUD, the group is protected.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Map | Leaflet + react-leaflet (CartoDB dark tiles) |
| Realtime | Socket.io |
| P2P offline | WebRTC DataChannels |
| Auth | Firebase (Google SSO) |
| Backend | Node.js + Express + Socket.io |
| Database | MongoDB (Mongoose) |
| Hosting | Vercel (client) + Railway (server) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Firebase project with Google Auth enabled

### Environment Variables

**Server** (`server/.env`):
```env
PORT=3001
MONGO_URI=mongodb://localhost:27017/bikersync
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_PRIVATE_KEY="your-private-key"
CLIENT_URL=http://localhost:5173
```

**Client** (`client/.env`):
```env
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your-app-id
```

### Run Locally

```bash
# Server
cd server
npm install
npm run dev

# Client (separate terminal)
cd client
npm install
npm run dev
```

Open http://localhost:5173

---

## Offline / Hotspot Mode

BikerSync uses WebRTC DataChannels to maintain full functionality when the group loses internet:

1. One rider enables their **mobile hotspot**
2. All other riders connect to that hotspot
3. Wait for the **P2P·N** green pill to appear in the top-left HUD
4. Mobile data can now be disabled — GPS, chat, PTT and SOS continue over LAN

The WebRTC mesh is established automatically while everyone has internet. The server is only needed for the initial handshake.

---

## Project Structure

```
BikerSync/
├── client/                  # React frontend
│   └── src/
│       ├── components/
│       │   ├── map/         # MapDashboard, RiderMarker, HotspotBanner
│       │   ├── comms/       # PushToTalk, GroupChat
│       │   ├── sos/         # SOSButton
│       │   └── ui/          # RiderList, SOSAlert
│       ├── context/         # RideContext, AuthContext
│       ├── hooks/           # useRideSession, useVoicePlayback, useGPS
│       ├── pages/           # Home, Ride, Login, Settings, Admin
│       └── services/        # socket, webrtcMesh, gpsOptimizer, api
└── server/                  # Node.js backend
    └── src/
        ├── sockets/         # locationHandler, chatHandler, voiceHandler
        ├── controllers/     # ride, sos, admin
        ├── models/          # Ride, Rider, SOSEvent
        └── routes/          # rides, sos, admin
```

---

## License

MIT
