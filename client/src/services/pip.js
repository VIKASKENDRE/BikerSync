/**
 * pip.js — Picture-in-Picture bridge (Android APK only).
 *
 * When the user taps Navigate, BikerSync enters PiP mode (small
 * floating window), then Google Maps opens full-screen beneath it.
 * The PiP window shows the live map so the lead can still monitor
 * the group while navigating.
 *
 * In the browser (PWA) the plugin doesn't exist — all calls are no-ops.
 */
import { registerPlugin } from '@capacitor/core';

// The plugin is registered by PiPPlugin.java on the Android side.
// In a browser context registerPlugin returns a stub that rejects — we catch all errors.
const PiPNative = registerPlugin('PiP');

/** Enter PiP mode. Resolves when the transition is initiated. */
export async function enterPiP() {
  try {
    await PiPNative.enter();
  } catch {
    // Browser / PiP not supported — safe to ignore
  }
}

/**
 * Open Google Maps natively and (optionally) drop into PiP in one pass.
 *
 * Returns true if the native plugin handled it, false otherwise (e.g. running
 * as a PWA in a browser) so callers can fall back to window.open.
 */
export async function openMapsWithPiP(url, { pip = true } = {}) {
  try {
    await PiPNative.openMaps({ url, pip });
    return true;
  } catch {
    // Browser / plugin missing / no maps app — let the caller fall back.
    return false;
  }
}

/**
 * Listen for PiP mode changes.
 * Callback receives { active: boolean }.
 * Returns a PluginListenerHandle with a .remove() method.
 */
export function onPiPChange(callback) {
  try {
    return PiPNative.addListener('pipChange', callback);
  } catch {
    return { remove: () => {} };
  }
}
