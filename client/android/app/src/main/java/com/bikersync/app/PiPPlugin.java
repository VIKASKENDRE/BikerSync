package com.bikersync.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Rational;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * PiPPlugin — enters Android Picture-in-Picture mode so BikerSync
 * floats as a small overlay while Google Maps runs in the foreground.
 *
 * JS usage:
 *   import { enterPiP, onPiPChange } from '../services/pip';
 *   await enterPiP();                        // shrink to PiP window
 *   onPiPChange(({ active }) => ...);        // listen for mode changes
 */
@CapacitorPlugin(name = "PiP")
public class PiPPlugin extends Plugin {

    /** Called from JS: puts the activity into PiP mode. */
    @PluginMethod
    public void enter(PluginCall call) {
        Activity activity = getActivity();
        try {
            enterPip(activity);
            call.resolve();
        } catch (Exception e) {
            call.reject("PiP not supported: " + e.getMessage());
        }
    }

    /**
     * Opens Google Maps and (optionally) drops BikerSync into PiP — in a single
     * synchronous pass.
     *
     * Why native instead of window.open(url, '_system'):
     *   The JS path entered PiP, waited, THEN fired the intent. By the time the
     *   intent fired, the PiP transition had completed and the activity was no
     *   longer "resumed", so Android 12+ silently dropped the activity launch
     *   (background-activity-launch restriction). Here we enter PiP and call
     *   startActivity() back-to-back while the activity is still resumed, so the
     *   launch is permitted.
     *
     * Params: { url: string, pip?: boolean (default true) }
     */
    @PluginMethod
    public void openMaps(PluginCall call) {
        final String url = call.getString("url");
        final boolean pip = Boolean.TRUE.equals(call.getBoolean("pip", true));
        if (url == null || url.isEmpty()) {
            call.reject("No url provided");
            return;
        }
        final Activity activity = getActivity();

        Intent base = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        base.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        // Prefer the Google Maps app if installed; otherwise let any handler take it.
        Intent gmaps = new Intent(base).setPackage("com.google.android.apps.maps");
        final Intent toLaunch =
            (gmaps.resolveActivity(activity.getPackageManager()) != null) ? gmaps : base;

        activity.runOnUiThread(() -> {
            try {
                if (pip) enterPip(activity);
                activity.startActivity(toLaunch);
                call.resolve();
            } catch (ActivityNotFoundException e) {
                call.reject("No maps app available");
            } catch (Exception e) {
                call.reject("Could not open maps: " + e.getMessage());
            }
        });
    }

    /** Enters PiP mode with the BikerSync 9:16 aspect ratio. */
    private void enterPip(Activity activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            android.app.PictureInPictureParams params =
                new android.app.PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(9, 16))
                    .build();
            activity.enterPictureInPictureMode(params);
        } else {
            // API 24-25: no params
            activity.enterPictureInPictureMode();
        }
    }

    /** Called by MainActivity when PiP state changes — fires a JS event. */
    public void notifyPiPChange(boolean isInPiP) {
        JSObject data = new JSObject();
        data.put("active", isInPiP);
        notifyListeners("pipChange", data, true);
    }
}
