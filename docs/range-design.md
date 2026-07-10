# Beating the Offline Range Limit

**Problem.** When the group has no internet, PTT/GPS/SOS ride on the WiFi
Direct mesh. Its two hard limits:

1. **Radio range** — WiFi Direct is ordinary 2.4/5 GHz WiFi: ~100–200 m open
   road, much less through helmets/bodies/traffic. Physics; not fixable in
   software.
2. **Star topology** — everyone connects to the lead's Group Owner (GO).
   Riders string out along a road, so the tail rider needing the mesh most is
   exactly the one out of range of the GO. Effective group span = 2× radio
   range at best. **This one is fixable.**

An additional constraint shapes everything: **Android allows a device to be in
only one WiFi Direct group at a time**, so a classic multi-hop WiFi Direct
mesh (every node relaying) is not directly buildable. Workarounds exist
(alternating GO/client roles, GO+legacy-client dual mode) but are fragile
across OEMs and drain battery.

---

## Option A — Store-and-forward gossip over existing transports

**Idea:** every rider re-broadcasts the freshest state they've heard, over
every transport they currently have. A mid-pack rider within WD range of both
the front and back halves bridges them. A single rider with one bar of 4G
uplinks the whole group's state and pulls everyone else's down.

- Message envelope gains `{ originId, seq, ttl }`; receivers keep a
  `lastSeq[originId]` table, drop stale/duplicate messages, decrement `ttl`,
  and re-send on all transports except the one it arrived on.
- GPS: relay only latest-per-rider (last-write-wins by `seq`) — no queue.
- Chat/SOS: small ring buffer (say 20 messages) retransmitted to newly
  connected peers, so a rider who reconnects gets what they missed.
- The codebase already has the seed of this: WebRTC signal relaying via a
  connected peer (`webrtc:signal` `from` override), and the RTDB fallback.

**Cost:** protocol change only — no new radios, works on every existing
transport (WD, WebRTC DataChannel, socket). **This is the highest-value step
and should be done first.** It also makes every later transport more useful,
because any new link automatically becomes a relay path.

**Limit:** doesn't create links that don't exist — it exploits partial
connectivity, it can't manufacture it.

## Option B — Migrate WiFi Direct to Google Nearby Connections (P2P_CLUSTER)

**Idea:** replace the hand-rolled WD plugin (~21 KB of Kotlin: deterministic
SSID/passphrase, `WifiNetworkSpecifier` connect, TCP relay server, Android 9
fallback, suggestion API juggling) with Play Services' Nearby Connections API.

- `Strategy.P2P_CLUSTER`: M-to-N connections — each device connects to
  multiple nearby devices simultaneously, no single GO bottleneck. Combined
  with Option A's gossip, this gives a real multi-hop mesh: A↔B↔C chains where
  A and C are out of mutual range.
- Manages Bluetooth Classic + BLE + WiFi (Direct/hotspot/LAN) together,
  including discovery, handshake, encryption, and automatic transport
  upgrade/downgrade. Deletes the most failure-prone code in the app (the
  system connect dialog dance, OEM quirks, reconnect loops).
- Same underlying radios, so per-hop range is comparable to today; the win is
  robustness + multi-link topology, not raw range.
- Costs: Play Services dependency (fine — app already requires it for maps &
  App Check), bandwidth per link can drop to Bluetooth speeds when WiFi
  upgrade fails (PTT audio at PCM16 would suffer → do the Opus/WebRTC-audio
  migration or send smaller voice chunks), and it replaces a battle-tested
  (if crusty) plugin, so it needs a real two-phone field test before shipping.

**Recommendation:** prototype behind a flag (`transport=nearby` vs `wifid`),
field-test with 3+ phones spread beyond single-hop range, then delete the WD
plugin. Do it *after* Option A, since gossip is what turns cluster links into
group-wide reach.

## Option C — BLE beaconing for GPS/SOS (connectionless)

**Idea:** each rider advertises a rotating BLE packet (~20 usable bytes:
compressed lat/lng delta, speed, battery, SOS flag) and scans for others. No
pairing, no connection, no topology — every rider passively hears everyone
within ~50–100 m and gossips the freshest data onward (Option A envelope).

- Strengths: zero connection management, scales to any group size, works
  while WD/Nearby is busy, very low battery cost in low-latency advertising
  mode. SOS propagation becomes extremely robust.
- Weaknesses: no voice/chat bandwidth (GPS+SOS only), Android advertising
  quirks per OEM, packet loss in noisy environments.
- Note: if Option B ships, Nearby Connections already uses BLE internally for
  discovery — a separate beacon layer is mostly redundant unless we want
  presence *without* connections. Treat C as an alternative to B for the
  GPS/SOS layer, not an addition.

## Option D — LoRa / Meshtastic hardware bridge (long-term, niche)

Kilometers of range, true mesh, but requires each rider (or at least lead +
sweep) to carry a ~₹3–5k Meshtastic node paired over BLE. Adventure-touring
riders already buy these. Would make BikerSync the only app in the segment
with multi-km offline SOS. Park it until there's user pull; the protocol work
from Option A (envelope, dedupe, TTL) carries over directly.

---

## Recommended sequence

| Step | What | Effort | Range effect |
|---|---|---|---|
| 1 | Gossip envelope + relay on existing transports (A) | ~3–5 days | Group span grows with every partial link; one online rider uplinks everyone |
| 2 | Nearby Connections prototype behind a flag (B) | ~1–2 weeks + field test | Multi-hop chains: span ≈ hops × 100–200 m instead of 2× |
| 3 | Opus voice (WebRTC audio track or opus-encoded chunks) | independent | Keeps PTT viable on Bluetooth-speed links from step 2 |
| 4 | Re-evaluate C/D after field data | — | — |

**Also worth stating in the UI:** whatever we build, offline voice beyond a
few hundred meters is physically out of reach without hardware (D). The
honest product answer for strung-out groups on dead-zone highways is: GPS/SOS
propagate hop-by-hop and catch up when any rider regains signal (A), and the
app should *show* riders when they're mesh-bridged vs isolated so expectations
match reality.
