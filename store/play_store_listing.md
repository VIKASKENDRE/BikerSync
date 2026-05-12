# BikerSync — Google Play Store Listing

## App Details

| Field | Value |
|---|---|
| App name | BikerSync |
| Package | com.bikersync.app |
| Category | Travel & Local |
| Content rating | Everyone |
| Developer email | vikaskendre1989@gmail.com |
| Privacy policy | https://vikaskendre.github.io/BikerSync/privacy-policy.html |

---

## Short Description
*(80 chars max — currently 79)*

```
Real-time GPS, voice & chat for motorcycle group rides. Ride together.
```

---

## Full Description
*(4000 chars max)*

```
BikerSync keeps your riding group connected — without anyone having to look at their phone.

Whether you're leading a weekend ride or coordinating a cross-country tour, BikerSync puts everything you need on one screen: live map, voice, chat, and emergency SOS.

🏍️ LIVE GPS TRACKING
See every rider on the map in real time. Know who's ahead, who's fallen behind, and where the group is at a glance. Ride Lead and Sweep positions are clearly marked so the group stays together.

🎙️ PUSH-TO-TALK VOICE
One rider opens the mic — a group channel opens for everyone. No need to call, no need to type. Talk while you ride (hands-free via helmet speakers). The talker's name is shown on screen so you always know who's speaking.

💬 GROUP CHAT
Send quick text messages to the whole group. A subtle chime alerts riders to new messages without being distracting. Chat history stays visible so nobody misses a stop change or route update.

🆘 ONE-TAP SOS
In an emergency, a single tap broadcasts your exact location to every rider in the group and to your pre-set emergency contacts. No confirmation dialogs, no delay — because seconds matter.

🗺️ NAVIGATE TAB
Search for any destination and launch Google Maps turn-by-turn navigation instantly — without leaving the app. Your location keeps updating for the group while you navigate.

📡 DUAL TRANSPORT
BikerSync uses Socket.io over mobile data as its primary connection and falls back to Firebase Realtime Database automatically when signal is weak. Your group stays connected even in spotty coverage areas.

🔋 BATTERY SMART
Background GPS uses Android's foreground service with optimized location polling — designed to last a full day's ride without draining your battery.

──────────────────────────────
PERMISSIONS EXPLAINED
• Location (always) — required for live map tracking while screen is off
• Microphone — required for Push-to-Talk voice
• Notifications — required for SOS alerts and ride invites
──────────────────────────────

BikerSync is built by riders, for riders. No subscriptions, no paywalls. Join a ride, start the session, and focus on the road.

Connect. Ride. Sync.
```

---

## Store Assets Checklist

| Asset | Spec | Status | Location |
|---|---|---|---|
| High-res icon | 512×512 PNG | ✅ | `D:\BikerSync\icon\bks.png` |
| Feature graphic | 1024×500 PNG | ✅ | `D:\BikerSync\store\feature_graphic.png` |
| Phone screenshots | 2–8, min 1080px | ✅ 7 ready | `C:\Users\vikas\Downloads\bikersync_ss\` |
| Privacy policy | Live URL | ✅ | https://vikaskendre.github.io/BikerSync/privacy-policy.html |

> **Note:** Play Console requires the icon to be uploaded separately as a 512×512 PNG — use `bks.png` directly (it's already the right size and format).

---

## AAB Build Commands

> Fill in your keystore password in `~/.gradle/gradle.properties` before building.

```bash
# 1. Build web assets
cd D:/BikerSync/client
npx vite build

# 2. Sync to Android
npx cap sync android

# 3. Build signed AAB
cd android
./gradlew bundleRelease

# Output:
# client/android/app/build/outputs/bundle/release/app-release.aab
```

---

## Play Console Upload Steps

1. Go to **Play Console → BikerSync → Production → Create new release**
2. Upload `app-release.aab`
3. Release name: `1.1 (2)`
4. Release notes (what's new):
```
• Push-to-Talk group voice channel — tap mic to talk, tap X to mute
• Real-time audio streaming — hear riders instantly as they speak
• One-tap SOS — no long-press needed
• Navigate tab — search destination, launch Google Maps turn-by-turn
• Wi-Fi Direct status pill replaces offline banner
```

---

## Content Rating Questionnaire (do inside Play Console)

- Violence: **None**
- Sexual content: **None**
- Profanity: **None**
- Controlled substances: **None**
- Location sharing: **Yes** (shared only within the active ride group, user-initiated)
- User-generated content: **Yes** (group chat — no moderation needed for private groups)

Expected rating: **Everyone**
