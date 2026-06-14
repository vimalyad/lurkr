import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import "./index.css";
import App from "./App.jsx";

// On the native APK, stop the WebView drawing under the status bar (edge-to-edge on
// Android 15+/targetSdk 35+ would otherwise let the header collide with the clock).
if (Capacitor.isNativePlatform()) {
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {}); // light icons on our dark bg
  StatusBar.setBackgroundColor({ color: "#0a0a0b" }).catch(() => {});
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
