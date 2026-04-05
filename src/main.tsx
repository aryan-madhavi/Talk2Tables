import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

// Register PWA service worker only in web (not Electron)
if (!window.navigator.userAgent.includes('Electron')) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true })
  })
}

createRoot(document.getElementById("root")!).render(<App />);
