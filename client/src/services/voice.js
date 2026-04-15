/**
 * voice.js — Capacitor bridge for the native VoicePlugin.
 *
 * On native (APK): uses AudioRecord directly — bypasses Android WebView's
 * audio capture stack which fails with NotReadableError on Samsung devices.
 *
 * On web (browser): all calls are no-ops; PushToTalk falls back to
 * navigator.mediaDevices.getUserMedia as usual.
 *
 * Events emitted by the plugin:
 *   'audioChunk'       { pcm16b64: string }  — base64 signed-16-bit PCM, 16 kHz mono
 *   'recordingStopped' {}
 */
import { registerPlugin } from '@capacitor/core';

const Voice = registerPlugin('Voice', {
  web: () => ({
    startRecording:  () => Promise.resolve(),
    stopRecording:   () => Promise.resolve(),
    addListener:     () => Promise.resolve({ remove: () => {} }),
    removeAllListeners: () => Promise.resolve(),
  }),
});

export default Voice;
