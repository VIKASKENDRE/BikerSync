package com.bikersync.app;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationResult;

/**
 * Capacitor bridge for the background location foreground service.
 *
 * JS usage:
 *   const BgLocation = registerPlugin('BackgroundLocation');
 *   await BgLocation.start();
 *   BgLocation.addListener('location', ({ lat, lng, speed, heading, accuracy }) => { ... });
 *   BgLocation.addListener('crashSuspected', () => { ... show countdown ... });
 *   await BgLocation.setCrashDetection({ enabled: true });
 *   await BgLocation.crashHandled();   // rider tapped "I'm OK" (or SOS fired)
 *   await BgLocation.stop();
 */
@CapacitorPlugin(
    name = "BackgroundLocation",
    permissions = {
        @Permission(strings = { "android.permission.POST_NOTIFICATIONS" }, alias = "notifications")
    }
)
public class LocationPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        // Android 13+: crash-alert notifications need POST_NOTIFICATIONS.
        // The service runs either way, so start it regardless of the answer.
        if (Build.VERSION.SDK_INT >= 33 &&
            getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationsCallback");
            return;
        }
        startService(call);
    }

    @PermissionCallback
    private void notificationsCallback(PluginCall call) {
        startService(call); // proceed whether granted or denied
    }

    private void startService(PluginCall call) {
        // Wire up the callback before the service starts so no fixes are lost.
        LocationService.pluginCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                if (result == null) return;
                android.location.Location loc = result.getLastLocation();
                if (loc == null) return;

                JSObject data = new JSObject();
                data.put("lat",      loc.getLatitude());
                data.put("lng",      loc.getLongitude());
                data.put("speed",    loc.hasSpeed()    ? loc.getSpeed()    : -1f);
                data.put("heading",  loc.hasBearing()  ? loc.getBearing()  : 0f);
                data.put("accuracy", loc.hasAccuracy() ? loc.getAccuracy() : 999f);
                // notifyListeners is thread-safe and posts to the main thread
                notifyListeners("location", data, true);
            }
        };

        LocationService.crashListener = () ->
            notifyListeners("crashSuspected", new JSObject(), true);

        Intent intent = new Intent(getContext(), LocationService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        LocationService.pluginCallback = null;
        LocationService.crashListener  = null;
        getContext().stopService(new Intent(getContext(), LocationService.class));
        call.resolve();
    }

    /** Enable/disable crash detection (Settings toggle). Applies live. */
    @PluginMethod
    public void setCrashDetection(PluginCall call) {
        LocationService.crashDetectionEnabled = call.getBoolean("enabled", true);
        call.resolve();
    }

    /** Rider answered the countdown (I'm OK or SOS sent) — clear the alert. */
    @PluginMethod
    public void crashHandled(PluginCall call) {
        LocationService.dismissCrashNotification(getContext());
        call.resolve();
    }

    /** Test hook: fires the same path as a real detection. */
    @PluginMethod
    public void simulateCrash(PluginCall call) {
        Runnable cb = LocationService.crashListener;
        if (cb != null) cb.run();
        call.resolve();
    }
}
