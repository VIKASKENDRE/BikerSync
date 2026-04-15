package com.bikersync.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.NetworkInfo
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSuggestion
import android.net.wifi.p2p.*
import android.os.Build
import android.os.Looper
import android.util.Log
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.*
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

@CapacitorPlugin(
    name = "WifiDirect",
    permissions = [
        Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION],  alias = "location"),
        Permission(strings = [Manifest.permission.ACCESS_WIFI_STATE],     alias = "wifiState"),
        Permission(strings = [Manifest.permission.CHANGE_WIFI_STATE],     alias = "changeWifi"),
        Permission(strings = [Manifest.permission.CHANGE_NETWORK_STATE],  alias = "changeNetwork"),
        Permission(strings = [Manifest.permission.INTERNET],              alias = "internet"),
        Permission(strings = ["android.permission.NEARBY_WIFI_DEVICES"],  alias = "nearbyWifi"),
    ]
)
class WifiDirectPlugin : Plugin() {

    companion object {
        private const val TAG  = "WifiDirect"
        private const val PORT = 8765
        private const val GO_IP = "192.168.49.1"
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
    private var isGroupOwner   = false
    @Volatile private var shouldRun = true
    private var serverSocket: ServerSocket? = null
    private var clientSocket:  Socket?      = null
    private val peerSockets = ConcurrentHashMap<String, Socket>()
    private val executor    = Executors.newCachedThreadPool()

    // ── Capacitor lifecycle ───────────────────────────────────────────────────
    override fun load() {
        p2pManager = context.getSystemService(Context.WIFI_P2P_SERVICE) as WifiP2pManager
        p2pChannel = p2pManager.initialize(context, Looper.getMainLooper(), null)
    }

    // ── Permissions ───────────────────────────────────────────────────────────

    @PluginMethod
    fun initialize(call: PluginCall) {
        val alias = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) "nearbyWifi" else "location"
        if (getPermissionState(alias) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias, call, "permCallback")
            return
        }
        registerReceiver()
        call.resolve()
    }

    @PermissionCallback
    private fun permCallback(call: PluginCall) {
        val alias = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) "nearbyWifi" else "location"
        if (getPermissionState(alias) == PermissionState.GRANTED) {
            registerReceiver()
            call.resolve()
        } else {
            call.reject("Wi-Fi Direct permission denied")
        }
    }

    // ── Group Owner (LEAD) ────────────────────────────────────────────────────

    /**
     * Create a persistent group. On Android 10+ uses a deterministic SSID
     * derived from rideId so non-LEAD phones know which network to join.
     * Resolves with { ssid, passphrase } so JS can display connection info.
     */
    @PluginMethod
    fun createGroup(call: PluginCall) {
        val rideId = call.getString("rideId") ?: ""

        fun handleGroupCreated() {
            isGroupOwner = true
            startTcpServer()
            android.os.Handler(Looper.getMainLooper()).postDelayed({
                p2pManager.requestGroupInfo(p2pChannel) { group ->
                    val ssid = group?.networkName ?: ""
                    val pass = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                        group?.passphrase ?: "" else ""
                    val ev = JSObject().apply {
                        put("ssid",       ssid)
                        put("passphrase", pass)
                    }
                    notifyListeners("groupInfoReady", ev)
                    call.resolve(ev)
                }
            }, 1500)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && rideId.isNotEmpty()) {
            val ssid = "DIRECT-BikerSync-${rideId.take(4)}"
            val pass = "bsync${rideId}".padEnd(8, '0').take(32)
            val config = WifiP2pConfig.Builder()
                .setNetworkName(ssid)
                .setPassphrase(pass)
                .build()
            p2pManager.createGroup(p2pChannel, config, object : WifiP2pManager.ActionListener {
                override fun onSuccess() { handleGroupCreated() }
                override fun onFailure(r: Int) {
                    Log.w(TAG, "createGroup with config failed ($r), falling back")
                    p2pManager.createGroup(p2pChannel, object : WifiP2pManager.ActionListener {
                        override fun onSuccess() { handleGroupCreated() }
                        override fun onFailure(r2: Int) { call.reject("createGroup failed: $r2") }
                    })
                }
            })
        } else {
            p2pManager.createGroup(p2pChannel, object : WifiP2pManager.ActionListener {
                override fun onSuccess() { handleGroupCreated() }
                override fun onFailure(r: Int) { call.reject("createGroup failed: $r") }
            })
        }
    }

    @PluginMethod
    fun removeGroup(call: PluginCall) {
        p2pManager.removeGroup(p2pChannel, object : WifiP2pManager.ActionListener {
            override fun onSuccess() { closeSockets(); call.resolve() }
            override fun onFailure(r: Int) = call.reject("removeGroup failed: $r")
        })
    }

    // ── Non-LEAD (client) ─────────────────────────────────────────────────────

    /**
     * Start peer discovery (legacy path).
     * Also starts continuous TCP polling to 192.168.49.1:8765 — this means
     * the TCP link is established the moment the user connects to the LEAD's
     * WiFi Direct group via ANY method (Settings, WPS, manual, etc.) without
     * needing a specific Android API or event callback.
     */
    @PluginMethod
    fun startDiscovery(call: PluginCall) {
        p2pManager.discoverPeers(p2pChannel, object : WifiP2pManager.ActionListener {
            override fun onSuccess() {}
            override fun onFailure(r: Int) { Log.w(TAG, "discoverPeers failed: $r") }
        })
        // Start polling regardless — handles both Settings-based and API-based connections
        pollTcpConnection()
        call.resolve()
    }

    @PluginMethod
    fun stopDiscovery(call: PluginCall) {
        p2pManager.stopPeerDiscovery(p2pChannel, listener(call))
    }

    /** Legacy: connect to a specific peer by MAC address. */
    @PluginMethod
    fun connect(call: PluginCall) {
        val address = call.getString("address") ?: return call.reject("address required")
        val config  = WifiP2pConfig().apply { deviceAddress = address }
        p2pManager.connect(p2pChannel, config, listener(call))
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        p2pManager.removeGroup(p2pChannel, object : WifiP2pManager.ActionListener {
            override fun onSuccess() { closeSockets(); call.resolve() }
            override fun onFailure(r: Int) { closeSockets(); call.resolve() }
        })
    }

    @PluginMethod
    fun sendMessage(call: PluginCall) {
        val message = call.getString("message") ?: return call.reject("message required")
        executor.submit {
            try {
                if (isGroupOwner) broadcastToClients(message)
                else {
                    val sock = clientSocket
                        ?: return@submit bridge.executeOnMainThread { call.reject("Not connected") }
                    PrintWriter(BufferedWriter(OutputStreamWriter(sock.getOutputStream())), true)
                        .println(message)
                }
                bridge.executeOnMainThread { call.resolve() }
            } catch (e: Exception) {
                bridge.executeOnMainThread { call.reject("Send failed: ${e.message}") }
            }
        }
    }

    // ── TCP server (Group Owner) ──────────────────────────────────────────────

    private fun startTcpServer() {
        if (serverSocket?.isClosed == false) return
        executor.submit {
            try {
                serverSocket = ServerSocket(PORT)
                Log.d(TAG, "TCP server listening :$PORT")
                while (shouldRun && serverSocket?.isClosed == false) {
                    val client = serverSocket!!.accept()
                    val addr   = client.inetAddress.hostAddress ?: "unknown"
                    peerSockets[addr] = client
                    emitPeerCount()
                    notifyListeners("tcpConnected", JSObject().apply {
                        put("connected", true); put("role", "go")
                    })
                    handlePeer(client, addr)
                }
            } catch (e: Exception) {
                if (shouldRun) Log.e(TAG, "TCP server error: ${e.message}")
            }
        }
    }

    private fun handlePeer(socket: Socket, addr: String) {
        executor.submit {
            try {
                val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    broadcastToClients(line!!, except = addr)
                    emitMessage(line!!)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Peer $addr dropped: ${e.message}")
            } finally {
                peerSockets.remove(addr)
                try { socket.close() } catch (_: Exception) {}
                emitPeerCount()
            }
        }
    }

    private fun broadcastToClients(msg: String, except: String? = null) {
        for ((addr, sock) in peerSockets) {
            if (addr == except) continue
            try {
                PrintWriter(BufferedWriter(OutputStreamWriter(sock.getOutputStream())), true)
                    .println(msg)
            } catch (e: Exception) {
                Log.w(TAG, "Broadcast to $addr failed: ${e.message}")
            }
        }
    }

    // ── TCP client polling (non-GO) ───────────────────────────────────────────

    /**
     * Continuously tries to connect to the GO's TCP server.
     * Retries every 5 s until connected or plugin is destroyed.
     * Works regardless of HOW the device joined the WiFi Direct network.
     */
    private fun pollTcpConnection() {
        if (isGroupOwner) return
        executor.submit {
            while (shouldRun) {
                if (clientSocket?.isConnected == true) { Thread.sleep(5000); continue }
                try {
                    val sock = Socket()
                    sock.connect(InetSocketAddress(GO_IP, PORT), 4000)
                    clientSocket = sock
                    Log.d(TAG, "TCP connected to GO $GO_IP:$PORT")
                    notifyListeners("tcpConnected", JSObject().apply {
                        put("connected", true); put("role", "client")
                    })
                    // Read loop
                    val reader = BufferedReader(InputStreamReader(sock.getInputStream()))
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        emitMessage(line!!)
                    }
                } catch (_: Exception) {
                    clientSocket = null
                }
                if (shouldRun) Thread.sleep(5000)
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
                            WifiP2pManager.EXTRA_NETWORK_INFO)
                        if (networkInfo?.isConnected == true) {
                            p2pManager.requestConnectionInfo(p2pChannel) { info ->
                                isGroupOwner = info.isGroupOwner
                                val goIp = info.groupOwnerAddress?.hostAddress ?: ""
                                notifyListeners("connectionChanged", JSObject().apply {
                                    put("connected",         true)
                                    put("isGroupOwner",      info.isGroupOwner)
                                    put("groupOwnerAddress", goIp)
                                })
                                if (info.isGroupOwner) startTcpServer()
                                // pollTcpConnection handles the client side
                            }
                        } else {
                            notifyListeners("connectionChanged",
                                JSObject().apply { put("connected", false) })
                        }
                    }

                    WifiP2pManager.WIFI_P2P_THIS_DEVICE_CHANGED_ACTION -> {
                        @Suppress("DEPRECATION")
                        val dev = intent.getParcelableExtra<WifiP2pDevice>(
                            WifiP2pManager.EXTRA_WIFI_P2P_DEVICE)
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

    // ── WifiNetworkSuggestion (API 29+) ──────────────────────────────────────

    private val currentSuggestions = mutableListOf<WifiNetworkSuggestion>()

    /**
     * Suggest the WD group network to Android's connectivity stack.
     * Android will connect automatically (no dialog after the one-time
     * "Allow BikerSync to manage Wi-Fi networks" notification).
     * Safe to call multiple times — removes any previous suggestion first.
     */
    @PluginMethod
    fun suggestNetwork(call: PluginCall) {
        val ssid       = call.getString("ssid")       ?: return call.reject("ssid required")
        val passphrase = call.getString("passphrase") ?: return call.reject("passphrase required")
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) { call.resolve(); return }

        val wifiManager = context.applicationContext
            .getSystemService(Context.WIFI_SERVICE) as WifiManager

        if (currentSuggestions.isNotEmpty()) {
            wifiManager.removeNetworkSuggestions(currentSuggestions)
            currentSuggestions.clear()
        }

        val suggestion = WifiNetworkSuggestion.Builder()
            .setSsid(ssid)
            .setWpa2Passphrase(passphrase)
            .build()
        currentSuggestions.add(suggestion)

        val status = wifiManager.addNetworkSuggestions(currentSuggestions)
        if (status == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS ||
            status == WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_ADD_DUPLICATE) {
            Log.d(TAG, "Network suggestion added for SSID=$ssid")
            call.resolve()
        } else {
            call.reject("addNetworkSuggestions failed: $status")
        }
    }

    /** Remove the previously added suggestion — called when internet is restored. */
    @PluginMethod
    fun removeSuggestion(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && currentSuggestions.isNotEmpty()) {
            val wifiManager = context.applicationContext
                .getSystemService(Context.WIFI_SERVICE) as WifiManager
            wifiManager.removeNetworkSuggestions(currentSuggestions)
            currentSuggestions.clear()
            Log.d(TAG, "Network suggestion removed")
        }
        call.resolve()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun emitMessage(msg: String) {
        notifyListeners("messageReceived", JSObject().apply { put("message", msg) })
    }

    private fun emitPeerCount() {
        notifyListeners("peerCountChanged", JSObject().apply { put("count", peerSockets.size) })
    }

    private fun listener(call: PluginCall) = object : WifiP2pManager.ActionListener {
        override fun onSuccess()            = call.resolve()
        override fun onFailure(reason: Int) = call.reject("Failed: $reason")
    }

    private fun closeSockets() {
        shouldRun = false
        try { serverSocket?.close() } catch (_: Exception) {}
        try { clientSocket?.close() } catch (_: Exception) {}
        peerSockets.values.forEach { try { it.close() } catch (_: Exception) {} }
        peerSockets.clear()
        serverSocket = null; clientSocket = null; isGroupOwner = false
    }

    override fun handleOnDestroy() {
        try { receiver?.let { context.unregisterReceiver(it) } } catch (_: Exception) {}
        closeSockets()
        executor.shutdown()
    }
}
