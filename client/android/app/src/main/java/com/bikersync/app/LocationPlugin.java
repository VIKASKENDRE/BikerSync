package com.bikersync.app;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationResult;

/**
 * Capacitor bridge for the background location foreground service.
 *
 * JS usage:
 *   const BgLocation = registerPlugin('BackgroundLocation');
 *   await BgLocation.start();
 *   BgLocation.addListener('location', ({ lat, lng, speed, heading, accuracy }) => { ... });
 *   await BgLocation.stop();
 */
@CapacitorPlugin(name = "BackgroundLocation")
public class LocationPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
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
        getContext().stopService(new Intent(getContext(), LocationService.class));
        call.resolve();
    }
}
