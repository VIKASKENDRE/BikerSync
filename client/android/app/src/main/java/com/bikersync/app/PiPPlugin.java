package com.bikersync.app;

import android.app.Activity;
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
            call.resolve();
        } catch (Exception e) {
            call.reject("PiP not supported: " + e.getMessage());
        }
    }

    /** Called by MainActivity when PiP state changes — fires a JS event. */
    public void notifyPiPChange(boolean isInPiP) {
        JSObject data = new JSObject();
        data.put("active", isInPiP);
        notifyListeners("pipChange", data, true);
    }
}
