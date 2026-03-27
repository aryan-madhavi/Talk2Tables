import { app as o, ipcMain as a, BrowserWindow as l } from "electron";
import n from "path";
import { fileURLToPath as s } from "url";
const d = s(import.meta.url), r = n.dirname(d);
let e = null;
function p() {
  e = new l({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: !1,
      contextIsolation: !0,
      // 👇 Use currentDir here
      preload: n.join(r, "preload.mjs")
    }
  }), process.env.VITE_DEV_SERVER_URL ? (e.loadURL(process.env.VITE_DEV_SERVER_URL), e.webContents.openDevTools()) : e.loadFile(n.join(r, "../dist/index.html"));
}
o.on("ready", p);
a.on("react-message", (t, i) => {
  console.log("Electron heard React Say: ", i), t.reply("main-reply", "Hello from the native desktop side!");
});
o.on("window-all-closed", () => {
  process.platform !== "darwin" && o.quit();
});
