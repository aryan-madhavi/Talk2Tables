// src/main.tsx
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

// Register PWA service worker only in web (not Electron)
if (!window.navigator.userAgent.includes('Electron')) {
  // Use dynamic key to prevent Rollup from resolving at build time
  const pwaModule = 'virtual:pwa-register';
  import(/* @vite-ignore */ pwaModule).then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
