package com.bikersync.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

/**
 * Foreground service that keeps GPS alive when BikerSync is backgrounded or
 * the screen is off. Shows a persistent notification as required by Android.
 *
 * Location updates are forwarded to LocationPlugin via a static callback.
 * The service starts when a ride begins and stops when the rider leaves.
 *
 * Also hosts CrashDetector (accelerometer crash detection): sensors keep
 * running here with the screen off, unlike in the WebView. On a suspected
 * crash the plugin listener notifies JS (which shows the countdown UI) and a
 * full-screen notification lights up the screen for the phone-in-pocket case.
 */
public class LocationService extends Service {

    static final String CHANNEL_ID       = "bs_location";
    static final String CRASH_CHANNEL_ID = "bs_crash";
    static final int    NOTIF_ID         = 1001;
    static final int    CRASH_NOTIF_ID   = 1002;

    // Set by LocationPlugin before starting the service.
    // Static so the service can call it without a direct reference to the plugin.
    static volatile LocationCallback pluginCallback = null;

    // Crash detection wiring (set by LocationPlugin)
    static volatile Runnable crashListener          = null;
    static volatile boolean  crashDetectionEnabled  = true;

    private FusedLocationProviderClient fusedClient;
    private LocationCallback            locationCallback;
    private CrashDetector               crashDetector;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
        fusedClient = LocationServices.getFusedLocationProviderClient(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIF_ID, buildNotification());

        LocationRequest req = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 3000)
            .setMinUpdateIntervalMillis(2000)
            .setMaxUpdateDelayMillis(5000)
            .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                if (result == null) return;
                android.location.Location loc = result.getLastLocation();
                if (loc != null && loc.hasSpeed() && crashDetector != null) {
                    crashDetector.updateSpeed(loc.getSpeed());
                }
                LocationCallback cb = pluginCallback;
                if (cb != null) cb.onLocationResult(result);
            }
        };

        try {
            fusedClient.requestLocationUpdates(req, locationCallback, Looper.getMainLooper());
        } catch (SecurityException ignored) {}

        if (crashDetector == null) {
            crashDetector = new CrashDetector(this, this::onCrashSuspected);
            crashDetector.start();
        }

        // START_STICKY: if the OS kills the service under memory pressure,
        // restart it automatically — critical for long rides.
        return START_STICKY;
    }

    private void onCrashSuspected() {
        if (!crashDetectionEnabled) return;
        Runnable cb = crashListener;
        if (cb != null) cb.run();
        showCrashNotification();
    }

    @Override
    public void onDestroy() {
        if (locationCallback != null) {
            fusedClient.removeLocationUpdates(locationCallback);
            locationCallback = null;
        }
        if (crashDetector != null) {
            crashDetector.stop();
            crashDetector = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("BikerSync Active")
            .setContentText("Tracking your location for the group ride")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .build();
    }

    /** Full-screen, alarm-category notification so the countdown reaches a
     *  rider whose phone is in their pocket with the screen off. Tapping it
     *  opens the app where the JS countdown modal is already showing. */
    private void showCrashNotification() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification n = new NotificationCompat.Builder(this, CRASH_CHANNEL_ID)
            .setContentTitle("Possible crash detected")
            .setContentText("Are you OK? Open BikerSync to cancel the SOS countdown.")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setFullScreenIntent(pi, true)
            .setVibrate(new long[]{0, 500, 250, 500, 250, 500})
            .build();

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(CRASH_NOTIF_ID, n);
    }

    static void dismissCrashNotification(android.content.Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(CRASH_NOTIF_ID);
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);

            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "BikerSync Location",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps GPS active during group rides");
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);

            NotificationChannel crash = new NotificationChannel(
                CRASH_CHANNEL_ID,
                "Crash Alerts",
                NotificationManager.IMPORTANCE_HIGH
            );
            crash.setDescription("Crash detection countdown alerts");
            crash.enableVibration(true);
            nm.createNotificationChannel(crash);
        }
    }
}
