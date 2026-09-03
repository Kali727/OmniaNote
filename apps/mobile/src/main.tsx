import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { defineCustomElements } from "@ionic/pwa-elements/loader";
import "./styles.css";
import App from "./App";

// Gives the Capacitor Camera plugin an actual capture UI when running in a browser
// (dev server, or the app installed as a PWA before native shells exist) — without
// this it silently falls back to a bare <input type=file>.
defineCustomElements(window);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
