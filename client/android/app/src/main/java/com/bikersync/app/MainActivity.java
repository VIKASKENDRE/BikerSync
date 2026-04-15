package com.bikersync.app;

import android.webkit.PermissionRequest;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(WifiDirectPlugin.class);
        registerPlugin(VoicePlugin.class);
        super.onCreate(savedInstanceState);

        // Auto-grant WebView media permissions. Must run in onCreate (CREATED state)
        // because BridgeWebChromeClient registers activity result launchers internally.
        getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                request.grant(request.getResources());
            }
        });
    }
}
