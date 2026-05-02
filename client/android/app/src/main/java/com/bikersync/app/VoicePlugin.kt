package com.bikersync.app

import android.Manifest
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import android.util.Log
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.util.concurrent.Executors

/**
 * VoicePlugin — native microphone recording for PTT.
 *
 * Bypasses the Android WebView audio capture stack (which fails with
 * NotReadableError on Samsung devices) by using AudioRecord directly.
 *
 * Emits 'audioChunk' events: { pcm16b64: string }  — base64-encoded
 * signed 16-bit PCM at 16 kHz mono, ~200 ms per chunk.
 *
 * JS PushToTalk detects Capacitor.isNativePlatform() and uses this
 * plugin instead of navigator.mediaDevices.getUserMedia.
 */
@CapacitorPlugin(
    name = "Voice",
    permissions = [
        Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")
    ]
)
class VoicePlugin : Plugin() {

    companion object {
        private const val TAG         = "VoicePlugin"
        private const val SAMPLE_RATE = 16000
        private const val CHANNEL     = AudioFormat.CHANNEL_IN_MONO
        private const val ENCODING    = AudioFormat.ENCODING_PCM_16BIT
        // ~200 ms worth of samples: 16000 samples/s × 0.2 s × 2 bytes = 6400 bytes
        private const val CHUNK_BYTES = SAMPLE_RATE * 2 * 200 / 1000
    }

    @Volatile private var isRecording = false
    private var audioRecord: AudioRecord? = null
    private val executor = Executors.newSingleThreadExecutor()

    @PluginMethod
    fun startRecording(call: PluginCall) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "micPermCallback")
            return
        }
        doStart(call)
    }

    @PluginMethod
    fun stopRecording(call: PluginCall) {
        doStop()
        call.resolve()
    }

    @PermissionCallback
    private fun micPermCallback(call: PluginCall) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            doStart(call)
        } else {
            call.reject("Microphone permission denied")
        }
    }

    private fun doStart(call: PluginCall) {
        if (isRecording) { call.resolve(); return }

        val minBuf  = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL, ENCODING)
        val bufSize = maxOf(minBuf * 4, CHUNK_BYTES * 2)

        val ar = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE, CHANNEL, ENCODING, bufSize
        )
        if (ar.state != AudioRecord.STATE_INITIALIZED) {
            ar.release()
            call.reject("AudioRecord failed to initialize (hardware unavailable)")
            return
        }

        audioRecord = ar
        isRecording = true
        ar.startRecording()
        Log.d(TAG, "Recording started at ${SAMPLE_RATE} Hz")

        executor.submit {
            val buffer = ByteArray(CHUNK_BYTES)
            while (isRecording) {
                val read = ar.read(buffer, 0, CHUNK_BYTES)
                if (read > 0) {
                    val b64 = Base64.encodeToString(buffer.copyOf(read), Base64.NO_WRAP)
                    notifyListeners("audioChunk", JSObject().apply { put("pcm16b64", b64) })
                }
            }
        }

        call.resolve()
    }

    private fun doStop() {
        isRecording = false
        try { audioRecord?.stop() } catch (_: Exception) {}
        try { audioRecord?.release() } catch (_: Exception) {}
        audioRecord = null
        notifyListeners("recordingStopped", JSObject())
        Log.d(TAG, "Recording stopped")
    }

    override fun handleOnPause() { if (isRecording) doStop() }

    override fun handleOnDestroy() {
        doStop()
        executor.shutdown()
    }
}
