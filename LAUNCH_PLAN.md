# BikerSync — Beta → Play Store → Open Source Launch Plan

## Quick Checklist

### Phase 1 — Beta Readiness
- [ ] Add Firebase Crashlytics (Android)
- [ ] Build and distribute signed debug APK to beta group
- [ ] Create WhatsApp beta group for bug reports
- [ ] Run at least one full group ride test (3+ phones, 30+ min)
- [ ] Confirm WiFi Direct auto-connects without manual steps
- [ ] Confirm PTT works on non-Samsung devices
- [ ] Confirm GPS trail is accurate at 40+ km/h
- [ ] Confirm SOS and group chat work offline (WiFi Direct)
- [ ] Fix any critical bugs found during beta
- [ ] Run beta for minimum 2 weeks

### Phase 2 — Play Store Prep
- [ ] Restrict Google Maps API key in Google Cloud Console
- [ ] Generate release keystore and sign release APK
- [ ] Back up keystore file securely (losing it = can never update the app)
- [ ] Upgrade `targetSdkVersion` to 34 in `build.gradle`
- [ ] Create adaptive app icon (all densities)
- [ ] Write Privacy Policy (covers location, audio, display name)
- [ ] Write Terms of Service
- [ ] Create Google Play Developer account ($25 one-time)
- [ ] Prepare Play Store listing (description, screenshots, feature graphic)
- [ ] Fill out Data Safety form in Play Console
- [ ] Submit for Internal Testing track (no review required)
- [ ] Submit for Closed Testing / Open Testing
- [ ] Pass full Google review → Production release

### Phase 3 — Open Source
- [ ] Merge `feature/wifi-direct` → `master`
- [ ] Add `LICENSE` file (MIT recommended)
- [ ] Write `CONTRIBUTING.md` (setup guide, how to run locally)
- [ ] Add `docker-compose.yml` for local MongoDB
- [ ] Review all commits for accidentally leaked secrets
- [ ] Make GitHub repo public
- [ ] Add repo link to Play Store listing

---

## Phase 1 — Beta Testing

**Goal:** Find real bugs with real riders before strangers do.

### Setup
1. Build the latest APK and share via WhatsApp or direct link
2. Create a dedicated WhatsApp group: "BikerSync Beta Testers"
3. Brief testers: *"Create a ride, add 2–3 people, ride together for 30 mins, screenshot anything weird"*
4. Add Crashlytics before distributing — so you get stack traces, not just "it crashed"

### What to test
| Scenario | What to check |
|---|---|
| 3+ phones on same ride | All riders visible on map |
| Internet → offline transition | WiFi Direct kicks in automatically |
| WiFi Direct range | ~200m — does it reconnect when back in range? |
| PTT | Voice heard on all connected devices |
| SOS | Alert visible on all riders' screens |
| 1-hour ride | App doesn't crash, trail looks correct |
| Cold start | GPS trail doesn't show triangle/zigzag |
| Samsung + non-Samsung mix | PTT works on both |
| Battery < 20% | Battery indicator updates |

### Known issues going into beta
- "Failed to fetch" on some mobile data networks (root cause TBD)
- WiFi Direct WifiNetworkSuggestion one-time notification — testers must tap Allow
- No background location — app must stay open while riding

### Beta duration
Minimum 2 weeks. Fix critical bugs, do a second round if needed.

---

## Phase 2 — Play Store Prep

### 2a. Security
**Restrict Google Maps API key**
1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click the Maps key used in `client/.env`
3. Application restrictions → Android apps → add `com.bikersync.app`
4. API restrictions → limit to: Maps JavaScript API, Directions API, Geocoding API, Geocoding API
5. Save — this prevents key theft from APK extraction

### 2b. Release Keystore
```bash
keytool -genkey -v -keystore bikersync-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias bikersync
```
> ⚠️ **Back this up in 3 places.** Google Play ties your app identity to this keystore.
> If you lose it, you cannot publish updates to your existing app — ever.

Store the keystore path and passwords in `client/android/gradle.properties` (gitignored):
```
RELEASE_STORE_FILE=../bikersync-release.jks
RELEASE_STORE_PASSWORD=your_store_password
RELEASE_KEY_ALIAS=bikersync
RELEASE_KEY_PASSWORD=your_key_password
```

### 2c. Build Configuration
In `client/android/app/build.gradle`, update:
```gradle
targetSdkVersion 34   // Play Store now requires 34+
versionCode 2         // increment every release
versionName "1.0.0"
```

Add release signing config:
```gradle
signingConfigs {
    release {
        storeFile     file(RELEASE_STORE_FILE)
        storePassword RELEASE_STORE_PASSWORD
        keyAlias      RELEASE_KEY_ALIAS
        keyPassword   RELEASE_KEY_PASSWORD
    }
}
buildTypes {
    release {
        signingConfig    signingConfigs.release
        minifyEnabled    false
    }
}
```

Build release APK:
```bash
./gradlew assembleRelease
```

### 2d. App Icon
Android requires adaptive icons. Minimum sizes needed:
- `mipmap-mdpi` — 48×48
- `mipmap-hdpi` — 72×72
- `mipmap-xhdpi` — 96×96
- `mipmap-xxhdpi` — 144×144
- `mipmap-xxxhdpi` — 192×192
- Adaptive icon foreground + background layers (108×108dp safe zone)
- Play Store icon — 512×512 PNG

### 2e. Privacy Policy
Must cover:
- Location data (collected while riding, shared with ride group only)
- Audio (PTT — recorded temporarily, not stored)
- Display name (stored on server for ride session)
- No data sold to third parties
- Data retention (rides deleted after X hours/days)
- Contact email for data deletion requests

Free generator: [app-privacy-policy-generator.nisrulz.com](https://app-privacy-policy-generator.nisrulz.com)
Host it on GitHub Pages or any public URL.

### 2f. Play Store Listing
**Required assets:**
- App icon: 512×512 PNG
- Feature graphic: 1024×500 PNG
- Screenshots: minimum 2, recommend 4–6 (phone screenshots at 16:9 or 9:16)
- Short description: 80 characters max
- Full description: up to 4000 characters

**Suggested short description:**
> Real-time group ride coordination with offline WiFi Direct fallback.

**Suggested screenshots to capture:**
1. Map with 3+ riders visible
2. Live PTT in action (LIVE button glowing)
3. Group chat
4. WiFi Direct connected (WD·2 pill visible)
5. SOS alert screen

### 2g. Data Safety Form (Play Console)
Declare:
| Data type | Collected | Shared | Purpose |
|---|---|---|---|
| Precise location | Yes | With ride group only | App functionality |
| Audio | Yes | With ride group only | Push-to-talk |
| Name | Yes | With ride group only | Rider identification |
| User IDs (Firebase UID) | Yes | No | Authentication |

### 2h. Play Console Track Order
1. **Internal Testing** — up to 100 testers, no Google review, instant publish
2. **Closed Testing (Alpha)** — invite-only, no review
3. **Open Testing (Beta)** — public opt-in, no full review
4. **Production** — full Google review (~3 business days for new apps)

---

## Phase 3 — Open Source

### Before making repo public
1. Run `git log --all --full-history -- "**/.env" "**google-services.json"` — confirm no secrets in history
2. Add `LICENSE` (MIT):
   ```
   MIT License — Copyright (c) 2026 Vikas Kendre
   ```
3. Update `README.md` with setup instructions, architecture diagram, screenshots
4. Add `CONTRIBUTING.md`:
   - Prerequisites (Node 18+, Android Studio, Java 17)
   - How to run server locally (MongoDB required)
   - How to build the APK
   - How to run the web client
5. Add `docker-compose.yml` so contributors can spin up MongoDB without installing it

### After going public
- Add GitHub topics: `android`, `capacitor`, `react`, `wifi-direct`, `group-ride`, `motorcycle`
- Link repo in Play Store listing
- Consider GitHub Discussions for feature requests

---

## Key Dates (suggested)

| Milestone | Target |
|---|---|
| Beta APK distributed | Week 1 |
| Beta round 1 complete | Week 3 |
| Play Store prep done | Week 4–5 |
| Internal Testing track live | Week 5 |
| Production release | Week 6–7 |
| Open source | Week 8 |
