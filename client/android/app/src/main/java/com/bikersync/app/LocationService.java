package com.bikersync.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
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
 */
public class LocationService extends Service {

    static final String CHANNEL_ID = "bs_location";
    static final int    NOTIF_ID   = 1001;

    // Set by LocationPlugin before starting the service.
    // Static so the service can call it without a direct reference to the plugin.
    static volatile LocationCallback pluginCallback = null;

    private FusedLocationProviderClient fusedClient;
    private LocationCallback            locationCallback;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
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
                LocationCallback cb = pluginCallback;
                if (cb != null) cb.onLocationResult(result);
            }
        };

        try {
            fusedClient.requestLocationUpdates(req, locationCallback, Looper.getMainLooper());
        } catch (SecurityException ignored) {}

        // START_STICKY: if the OS kills the service under memory pressure,
        // restart it automatically — critical for long rides.
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (locationCallback != null) {
            fusedClient.removeLocationUpdates(locationCallback);
            locationCallback = null;
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

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "BikerSync Location",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps GPS active during group rides");
            channel.setShowBadge(false);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }
}
