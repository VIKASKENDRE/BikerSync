/**
 * wifiDirect.js
 * JS bridge to the native WifiDirectPlugin (Capacitor / Android).
 *
 * Usage:
 *   import WifiDirect from './wifiDirect'
 *
 *   await WifiDirect.initialize()
 *   await WifiDirect.createGroup()          // ride lead — becomes Group Owner
 *   await WifiDirect.startDiscovery()       // other riders — scan for peers
 *   WifiDirect.addListener('peersChanged', ({ peers }) => ...)
 *   await WifiDirect.connect({ address })   // connect to ride lead's device
 *   WifiDirect.addListener('messageReceived', ({ message }) => ...)
 *   await WifiDirect.sendMessage({ message: JSON.stringify(payload) })
 *
 * On the web (Vercel / browser) the plugin is not available — all calls are
 * no-ops so the rest of the app still runs via the existing Socket.io path.
 */

import { registerPlugin } from '@capacitor/core'

const WifiDirect = registerPlugin('WifiDirect', {
  // Web fallback — silent no-ops so the app doesn't crash in a browser
  web: () => ({
    initialize:     () => Promise.resolve(),
    startDiscovery: () => Promise.resolve(),
    stopDiscovery:  () => Promise.resolve(),
    createGroup:    () => Promise.resolve(),
    removeGroup:    () => Promise.resolve(),
    connect:         () => Promise.resolve(),
    disconnect:      () => Promise.resolve(),
    sendMessage:     () => Promise.resolve(),
    suggestNetwork:  () => Promise.resolve(),
    removeSuggestion:() => Promise.resolve(),
    addListener:    () => ({ remove: () => {} }),
    removeAllListeners: () => Promise.resolve(),
  }),
})

export default WifiDirect

/**
 * Events emitted by the plugin (use WifiDirect.addListener(event, cb)):
 *
 * 'stateChanged'      { enabled: boolean }
 * 'peersChanged'      { peers: Array<{ name, address, status }> }
 * 'connectionChanged' { connected, isGroupOwner, groupOwnerAddress? }
 * 'thisDeviceChanged' { name, address }
 * 'messageReceived'   { message: string }   ← JSON payload from peers
 * 'peerCountChanged'  { count: number }     ← GO-side: how many clients
 */
