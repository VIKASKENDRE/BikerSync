package com.bikersync.app;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

/**
 * Accelerometer-based crash detection. Runs inside LocationService so it
 * keeps working with the screen off (WebView sensors don't).
 *
 * State machine:
 *   ARMED     — rider had riding speed (≥ MIN_RIDING_MPS) within ARM_WINDOW_MS.
 *               A dropped phone while stopped never arms.
 *   IMPACT    — acceleration magnitude exceeded IMPACT_MS2 while armed.
 *   STILLNESS — after a GRACE_MS tumble allowance, observe until
 *               STILLNESS_MS past impact. Sustained motion or resumed GPS
 *               speed cancels back to ARMED (pothole/bump case: the rider
 *               keeps riding). A still phone and a stopped rider → fire.
 *
 * Thresholds are conservative first guesses; tune with real ride data.
 */
class CrashDetector implements SensorEventListener {

    interface Listener {
        void onCrashSuspected();
    }

    private static final float IMPACT_MS2      = 58.8f;  // ~6 g impact spike
    private static final float STILL_DELTA_MS2 = 3.0f;   // ±3 m/s² around gravity = "still"
    private static final float MIN_RIDING_MPS  = 4.2f;   // ~15 km/h required to arm
    private static final float MAX_STILL_MPS   = 1.5f;   // GPS speed considered stopped
    private static final long  ARM_WINDOW_MS   = 10_000; // how long a speed reading stays valid
    private static final long  GRACE_MS        = 3_000;  // ignore tumbling right after impact
    private static final long  STILLNESS_MS    = 12_000; // total observation window after impact
    private static final int   MOTION_BUDGET   = 50;     // ~1 s of motion samples allowed in window

    private final SensorManager sensorManager;
    private final Sensor accelerometer;
    private final Listener listener;

    private volatile float lastSpeedMps = -1f;
    private volatile long  lastSpeedAt  = 0;

    private boolean watching    = false; // inside post-impact observation window
    private long    impactAt    = 0;
    private int     motionCount = 0;
    private boolean fired       = false;

    CrashDetector(Context ctx, Listener listener) {
        this.listener      = listener;
        this.sensorManager = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
        this.accelerometer = sensorManager != null
            ? sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
            : null;
    }

    void start() {
        if (sensorManager != null && accelerometer != null) {
            sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_GAME);
        }
    }

    void stop() {
        if (sensorManager != null) sensorManager.unregisterListener(this);
        reset();
    }

    /** Fed from the GPS callback (m/s). Resumed riding cancels a pending window. */
    void updateSpeed(float mps) {
        lastSpeedMps = mps;
        lastSpeedAt  = System.currentTimeMillis();
        if (watching && mps > MIN_RIDING_MPS) reset();
    }

    private void reset() {
        watching    = false;
        impactAt    = 0;
        motionCount = 0;
        fired       = false;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        float x = event.values[0], y = event.values[1], z = event.values[2];
        float mag = (float) Math.sqrt(x * x + y * y + z * z);
        long now = System.currentTimeMillis();

        if (!watching) {
            boolean armed = lastSpeedMps >= MIN_RIDING_MPS && (now - lastSpeedAt) <= ARM_WINDOW_MS;
            if (armed && mag >= IMPACT_MS2) {
                watching    = true;
                impactAt    = now;
                motionCount = 0;
                fired       = false;
            }
            return;
        }

        if (fired) return;
        long sinceImpact = now - impactAt;
        if (sinceImpact < GRACE_MS) return; // bike/phone still tumbling

        if (Math.abs(mag - SensorManager.GRAVITY_EARTH) > STILL_DELTA_MS2) {
            motionCount++;
            if (motionCount > MOTION_BUDGET) { reset(); return; } // rider is moving — not a crash
        }

        if (sinceImpact >= STILLNESS_MS) {
            // Unknown speed (no GPS fix since impact) is treated as stopped —
            // better a cancellable false alarm than a missed crash.
            boolean speedStill = lastSpeedMps <= MAX_STILL_MPS || lastSpeedAt <= impactAt;
            if (speedStill) {
                fired = true;
                listener.onCrashSuspected();
            } else {
                reset();
            }
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
