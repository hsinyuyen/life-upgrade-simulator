package com.levelup.liferpg;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.PermissionRequest;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private ValueCallback<Uri[]> filePathCallback;
    private ActivityResultLauncher<String> cameraPermissionLauncher;
    private PermissionRequest pendingPermissionRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Handle runtime camera permission requests from WebView
        cameraPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            isGranted -> {
                if (isGranted && pendingPermissionRequest != null) {
                    pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
                } else if (pendingPermissionRequest != null) {
                    pendingPermissionRequest.deny();
                }
                pendingPermissionRequest = null;
            }
        );
    }

    @Override
    public void onStart() {
        super.onStart();

        // Get the WebView from Capacitor's bridge and configure camera/file access
        WebView webView = getBridge().getWebView();
        webView.setWebChromeClient(new WebChromeClient() {

            // Handle <input type="file"> and camera capture
            @Override
            public boolean onShowFileChooser(
                WebView webView,
                ValueCallback<Uri[]> callback,
                FileChooserParams params
            ) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                // Delegate to Capacitor's default handling
                return false;
            }

            // Handle WebRTC / getUserMedia camera permission for barcode scanner
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                String[] resources = request.getResources();
                for (String resource : resources) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                        // Check if we have camera permission
                        if (checkSelfPermission(android.Manifest.permission.CAMERA)
                                == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                            request.grant(request.getResources());
                        } else {
                            pendingPermissionRequest = request;
                            cameraPermissionLauncher.launch(android.Manifest.permission.CAMERA);
                        }
                        return;
                    }
                }
                request.deny();
            }
        });
    }
}
