import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./lib/syncQueue"; // registers the offline-outbox timers/listeners as soon as the app opens
import App from "./App";

// Deliberately NOT registering @ionic/pwa-elements' <pwa-camera-modal> here. It gives
// the Capacitor Camera plugin a custom in-page capture UI built on getUserMedia, but
// that UI is prone to rendering a black/frozen frame on many mobile browsers (the video
// element paints before a real frame arrives) — the exact "camera preview is black" /
// "photo disappears after confirming" reports this file's absence fixes. Leaving it
// unregistered makes Camera.getPhoto() fall back to a plain
// `<input type="file" accept="image/*" capture="environment">`, which hands off to the
// OS's own camera app — no custom preview to render, so nothing to render black.

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
