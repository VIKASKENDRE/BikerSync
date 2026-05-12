package com.bikersync.app;

import android.content.res.Configuration;
import android.content.SharedPreferences;
import android.webkit.PermissionRequest;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.google.firebase.crashlytics.FirebaseCrashlytics;
import com.google.firebase.appcheck.FirebaseAppCheck;
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(WifiDirectPlugin.class);
        registerPlugin(VoicePlugin.class);
        registerPlugin(PiPPlugin.class);
        registerPlugin(LocationPlugin.class);
        super.onCreate(savedInstanceState);

        FirebaseAppCheck.getInstance().installAppCheckProviderFactory(
            PlayIntegrityAppCheckProviderFactory.getInstance()
        );

        // Tag crash reports with the rider's localStorage UUID so we can
        // correlate a Crashlytics report with a specific beta tester.
        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", MODE_PRIVATE);
        String riderId = prefs.getString("bs_rider_id", null);
        if (riderId != null) {
            FirebaseCrashlytics.getInstance().setUserId(riderId);
        }

        // Auto-grant WebView media permissions. Must run in onCreate (CREATED state)
        // because BridgeWebChromeClient registers activity result launchers internally.
        getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                request.grant(request.getResources());
            }
        });
    }

    /**
     * Fired by Android whenever PiP state changes (enter or exit).
     * We forward this to the JS layer via PiPPlugin so the UI can
     * hide controls while floating.
     */
    @Override
    public void onPictureInPictureModeChanged(boolean isInPiP, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPiP, newConfig);
        try {
            PiPPlugin pip = (PiPPlugin) getBridge().getPlugin("PiP").getInstance();
            if (pip != null) pip.notifyPiPChange(isInPiP);
        } catch (Exception ignored) {}
    }
}
