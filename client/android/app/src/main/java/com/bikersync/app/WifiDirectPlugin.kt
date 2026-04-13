package com.bikersync.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.NetworkInfo
import android.net.wifi.p2p.*
import android.os.Build
import android.os.Looper
import android.util.Log
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject
import java.io.*
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

@CapacitorPlugin(
    name = "WifiDirect",
    permissions = [
        Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION],        alias = "location"),
        Permission(strings = [Manifest.permission.ACCESS_WIFI_STATE],           alias = "wifiState"),
        Permission(strings = [Manifest.permission.CHANGE_WIFI_STATE],           alias = "changeWifi"),
        Permission(strings = [Manifest.permission.CHANGE_NETWORK_STATE],        alias = "changeNetwork"),
        Permission(strings = [Manifest.permission.INTERNET],                    alias = "internet"),
    ]
)
class WifiDirectPlugin : Plugin() {

    companion object {
        private const val TAG  = "WifiDirect"
        private const val PORT = 8765
    }

    // ── Wi-Fi Direct manager ──────────────────────────────────────────────────
    private lateinit var p2pManager: WifiP2pManager
    private lateinit var p2pChannel: WifiP2pManager.Channel
    private var receiver: BroadcastReceiver? = null

    private val intentFilter = IntentFilter().apply {
        addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION)
        addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION)
        addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION)
        addAction(WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION)
    }

    // ── Socket state ─────────────────────────────────────────────────────────
    private var isGroupOwner  = false
    private var serverSocket: ServerSocket?  = null
    private var clientSocket:  Socket?       = null
    private val peerSockets = ConcurrentHashMap<String, Socket>()   // GO-side: addr → socket
    private val executor    = Executors.newCachedThreadPool()

    // ── Capacitor lifecycle ───────────────────────────────────────────────────
    override fun load() {
        p2pManager = context.getSystemService(Context.WIFI_P2P_SERVICE) as WifiP2pManager
        p2pChannel = p2pManager.initialize(context, Looper.getMainLooper(), null)
    }

    // ── Plugin methods ────────────────────────────────────────────────────────

    /** Must be called first. Registers the broadcast receiver and requests permissions. */
    @PluginMethod
    fun initialize(call: PluginCall) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "permissionCallback")
            return
        }
        registerReceiver()
        call.resolve()
    }

    @PermissionCallback
    private fun permissionCallback(call: PluginCall) {
        if (getPermissionState("location") == PermissionState.GRANTED) {
            registerReceiver()
            call.resolve()
        } else {
            call.reject("Location permission required for Wi-Fi Direct")
        }
    }

    /** Start scanning for nearby peers. */
    @PluginMethod
    fun startDiscovery(call: PluginCall) {
        p2pManager.discoverPeers(p2pChannel, listener(call))
    }

    /** Stop scanning. */
    @PluginMethod
    fun stopDiscovery(call: PluginCall) {
        p2pManager.stopPeerDiscovery(p2pChannel, listener(call))
    }

    /**
     * Create a persistent Wi-Fi Direct group — this device becomes the
     * Group Owner (192.168.49.1) and also starts the TCP relay server.
     */
    @PluginMethod
    fun createGroup(call: PluginCall) {
        p2pManager.createGroup(p2pChannel, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {
                isGroupOwner = true
                startTcpServer()
                call.resolve()
            }
            override fun onFailure(reason: Int) = call.reject("createGroup failed: $reason")
        })
    }

    /** Disband the group / leave the group. */
    @PluginMethod
    fun removeGroup(call: PluginCall) {
        p2pManager.removeGroup(p2pChannel, object : WifiP2pManager.ActionListener {
            override fun onSuccess() { closeSockets(); call.resolve() }
            override fun onFailure(reason: Int) = call.reject("removeGroup failed: $reason")
        })
    }

    /**
     * Connect to a peer by device MAC address.
     * After Android negotiates the group, the connectionChanged event fires
     * and we start the TCP client automatically.
     */
    @PluginMethod
    fun connect(call: PluginCall) {
        val address = call.getString("address")
            ?: return call.reject("address is required")
        val config = WifiP2pConfig().apply { deviceAddress = address }
        p2pManager.connect(p2pChannel, config, listener(call))
    }

    /** Disconnect and clean up sockets. */
    @PluginMethod
    fun disconnect(call: PluginCall) {
        p2pManager.removeGroup(p2pChannel, object : WifiP2pManager.ActionListener {
            override fun onSuccess() { closeSockets(); call.resolve() }
            override fun onFailure(reason: Int) { closeSockets(); call.resolve() }
        })
    }

    /**
     * Send a JSON string to all connected peers.
     * GO → broadcast to all clients.
     * Client → send to GO (which relays to everyone else).
     */
    @PluginMethod
    fun sendMessage(call: PluginCall) {
        val message = call.getString("message")
            ?: return call.reject("message is required")

        executor.submit {
            try {
                if (isGroupOwner) {
                    broadcastToClients(message)
                } else {
                    val sock = clientSocket
                        ?: return@submit bridge.executeOnMainThread { call.reject("Not connected") }
                    PrintWriter(BufferedWriter(OutputStreamWriter(sock.getOutputStream())), true)
                        .println(message)
                }
                bridge.executeOnMainThread { call.resolve() }
            } catch (e: Exception) {
                Log.e(TAG, "sendMessage error", e)
                bridge.executeOnMainThread { call.reject("Send failed: ${e.message}") }
            }
        }
    }

    // ── TCP server (Group Owner) ──────────────────────────────────────────────

    private fun startTcpServer() {
        executor.submit {
            try {
                serverSocket = ServerSocket(PORT)
                Log.d(TAG, "TCP server listening on :$PORT")
                while (serverSocket?.isClosed == false) {
                    val client = serverSocket!!.accept()
                    val addr   = client.inetAddress.hostAddress ?: "unknown"
                    peerSockets[addr] = client
                    Log.d(TAG, "Peer connected: $addr  total=${peerSockets.size}")
                    emitPeerCount()
                    handlePeer(client, addr)
                }
            } catch (e: Exception) {
                if (serverSocket?.isClosed == false) Log.e(TAG, "Server error", e)
            }
        }
    }

    /** Read loop for a single peer connected to the GO. Relays to all others + JS. */
    private fun handlePeer(socket: Socket, addr: String) {
        executor.submit {
            try {
                val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    val msg = line!!
                    broadcastToClients(msg, except = addr)          // relay
                    emitMessage(msg)                                 // notify JS
                }
            } catch (e: Exception) {
                Log.w(TAG, "Peer $addr disconnected: ${e.message}")
            } finally {
                peerSockets.remove(addr)
                try { socket.close() } catch (_: Exception) {}
                emitPeerCount()
            }
        }
    }

    private fun broadcastToClients(message: String, except: String? = null) {
        for ((addr, sock) in peerSockets) {
            if (addr == except) continue
            try {
                PrintWriter(BufferedWriter(OutputStreamWriter(sock.getOutputStream())), true)
                    .println(message)
            } catch (e: Exception) {
                Log.w(TAG, "Broadcast to $addr failed: ${e.message}")
            }
        }
    }

    // ── TCP client (non-GO peer) ──────────────────────────────────────────────

    private fun connectToServer(goIp: String) {
        executor.submit {
            try {
                val sock = Socket()
                sock.connect(InetSocketAddress(goIp, PORT), 8000)
                clientSocket = sock
                Log.d(TAG, "Connected to GO at $goIp:$PORT")

                val reader = BufferedReader(InputStreamReader(sock.getInputStream()))
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    emitMessage(line!!)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Client error: ${e.message}")
                val ev = JSObject().apply { put("connected", false); put("reason", e.message) }
                notifyListeners("connectionChanged", ev)
            }
        }
    }

    // ── BroadcastReceiver ─────────────────────────────────────────────────────

    @SuppressLint("UnspecifiedRegisterReceiverFlag")
    private fun registerReceiver() {
        if (receiver != null) return
        receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                when (intent.action) {

                    WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION -> {
                        val enabled = intent.getIntExtra(WifiP2pManager.EXTRA_WIFI_STATE, -1) ==
                                WifiP2pManager.WIFI_P2P_STATE_ENABLED
                        notifyListeners("stateChanged", JSObject().apply { put("enabled", enabled) })
                    }

                    WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION -> {
                        p2pManager.requestPeers(p2pChannel) { peerList ->
                            val arr = JSArray()
                            peerList.deviceList.forEach { dev ->
                                arr.put(JSObject().apply {
                                    put("name",    dev.deviceName)
                                    put("address", dev.deviceAddress)
                                    put("status",  dev.status)
                                })
                            }
                            notifyListeners("peersChanged", JSObject().apply { put("peers", arr) })
                        }
                    }

                    WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION -> {
                        @Suppress("DEPRECATION")
                        val networkInfo = intent.getParcelableExtra<NetworkInfo>(
                            WifiP2pManager.EXTRA_NETWORK_INFO
                        )
                        if (networkInfo?.isConnected == true) {
                            p2pManager.requestConnectionInfo(p2pChannel) { info ->
                                isGroupOwner = info.isGroupOwner
                                val goIp = info.groupOwnerAddress?.hostAddress ?: ""
                                notifyListeners("connectionChanged", JSObject().apply {
                                    put("connected",        true)
                                    put("isGroupOwner",     info.isGroupOwner)
                                    put("groupOwnerAddress", goIp)
                                })
                                // Non-GO peers open the TCP client now
                                if (!info.isGroupOwner && goIp.isNotEmpty()) {
                                    connectToServer(goIp)
                                }
                            }
                        } else {
                            notifyListeners("connectionChanged", JSObject().apply { put("connected", false) })
                        }
                    }

                    WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION -> {
                        @Suppress("DEPRECATION")
                        val dev = intent.getParcelableExtra<WifiP2pDevice>(
                            WifiP2pManager.EXTRA_WIFI_P2P_DEVICE
                        )
                        notifyListeners("thisDeviceChanged", JSObject().apply {
                            put("name",    dev?.deviceName    ?: "")
                            put("address", dev?.deviceAddress ?: "")
                        })
                    }
                }
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, intentFilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(receiver, intentFilter)
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun emitMessage(msg: String) {
        notifyListeners("messageReceived", JSObject().apply { put("message", msg) })
    }

    private fun emitPeerCount() {
        notifyListeners("peerCountChanged", JSObject().apply { put("count", peerSockets.size) })
    }

    private fun listener(call: PluginCall) = object : WifiP2pManager.ActionListener {
        override fun onSuccess()              = call.resolve()
        override fun onFailure(reason: Int)   = call.reject("Failed: $reason")
    }

    private fun closeSockets() {
        try { serverSocket?.close() } catch (_: Exception) {}
        try { clientSocket?.close() } catch (_: Exception) {}
        peerSockets.values.forEach { try { it.close() } catch (_: Exception) {} }
        peerSockets.clear()
        serverSocket  = null
        clientSocket  = null
        isGroupOwner  = false
    }

    override fun handleOnDestroy() {
        try { receiver?.let { context.unregisterReceiver(it) } } catch (_: Exception) {}
        closeSockets()
        executor.shutdown()
    }
}
