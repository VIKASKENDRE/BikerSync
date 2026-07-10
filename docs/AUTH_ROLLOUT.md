# Auth Rollout Runbook

The auth hardening (Firebase Anonymous Auth on clients, verified uids on the
server, strict RTDB rules) must roll out in phases because v1.2.1 production
clients send no tokens. Deploying everything at once would kick every current
user out of their rides.

## What changed

| Layer | Before | After |
|---|---|---|
| Client identity | localStorage UUID, unverifiable | Firebase **anonymous** user (no login screen); uid provable via ID token |
| Socket.io | No auth; client-claimed riderId/role trusted | Handshake verifies ID token; server derives riderId from uid and decides roles from the Ride doc |
| REST /api/rides, /api/sos | No auth | Token verified when present (`softAuth`); uid overrides body riderId; `end` requires lead |
| RTDB rules | Anyone with a ride ID could read/write/delete everything | v2 rules: membership-gated, per-rider GPS ownership, sender-pinned chat/SOS, only lead deletes the ride |

`AUTH_ENFORCE` (Railway env var) is the switch between "soft mode" (tokens
verified when sent, legacy clients still allowed) and full enforcement.

## Phase 0 — one-time setup (before deploying anything)

1. **Firebase Console → Authentication → Sign-in method → enable "Anonymous".**
   Without this, `signInAnonymously` fails with `auth/admin-restricted-operation`;
   the client silently falls back to the legacy UUID (soft mode still works,
   but nothing gets authenticated).
2. **Railway env vars** — confirm/add:
   - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
     (already set — social routes use them)
   - `FIREBASE_DATABASE_URL` = `https://bikersync-505f4-default-rtdb.firebaseio.com`
     (**new** — needed for server-side RTDB membership writes)
   - `AUTH_ENFORCE` — leave unset/`false` for now

## Phase 1 — deploy server (safe immediately)

`railway up`. Soft mode: legacy clients keep working, tokens are verified when
sent, role spoofing via socket is already blocked (server decides roles even
for unauthenticated joins).

## Phase 2 — release the authenticated app build (v1.3)

Build, upload to Play Console, wait for rollout. New clients sign in
anonymously at launch and send ID tokens on every socket connect and ride
REST call.

## Phase 3 — enforce (after v1.3 has healthy adoption)

1. Railway: set `AUTH_ENFORCE=true`. Tokenless sockets/REST now get 401/unauthorized.
2. Deploy strict RTDB rules:
   ```
   copy database.rules.v2.json database.rules.json
   firebase deploy --only database
   ```
   (Remove the `_comment` key first if the CLI complains about unknown keys.)
3. Verify with a v1.3 device: create ride, join from second device, GPS/chat/SOS/PTT.

**Anyone still on ≤ v1.2.1 loses live tracking at this point** (they can still
navigate solo). Watch Play Console adoption stats before flipping.

## Rollback

- Server misbehaving: unset `AUTH_ENFORCE` (back to soft mode) — no client impact.
- RTDB rules issue: redeploy the old permissive `database.rules.json` from git
  (`git show 8ca9bcc:database.rules.json`).

## Known trade-offs under v2 rules

- If the Railway server is down, new riders can't be added to `/members`, so
  the RTDB fallback transport won't accept them mid-outage (WiFi Direct and
  WebRTC-over-socket are also affected by a server outage; offline mesh keeps
  working). Existing members keep working.
- Client-side TTL cleanup of *other* riders' stale chat/SOS entries is denied;
  data is removed when the lead's client deletes the ride node at ride end.
  Rides abandoned without an explicit end linger in RTDB (few KB each) — a
  scheduled cleanup (Cloud Function or server cron) can be added later.
- Ride IDs alone no longer grant access to anything server-side; they remain
  the join *invitation*, but joining now requires the REST join (which records
  membership) with a valid ID token.
