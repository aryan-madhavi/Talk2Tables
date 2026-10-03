import { app, BrowserWindow, ipcMain, IpcMainEvent } from 'electron';
import path from 'path';
import os from 'os';

// For CommonJS, use the standard __dirname and __filename
const currentDir = __dirname;

// ── Pin userData to a stable path BEFORE app is ready ─────────────────────────
// AppImages on Linux can run from different mount points each launch, which
// causes Electron to derive a different userData path and lose all persisted
// cookies/IndexedDB (= auth state). Pinning to ~/.config/<name> fixes this.
if (process.platform === 'linux') {
  app.setPath(
    'userData',
    path.join(os.homedir(), '.config', 'talk2tables')
  );
}

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const preloadPath = app.isPackaged
    ? path.join(process.resourcesPath, 'preload', 'preload.js')
    : path.join(currentDir, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      // Persist cookies/IndexedDB across restarts by using the default
      // session (which is now rooted at the pinned userData path above).
      // Do NOT set partition: 'incognito' or any in-memory partition here.
      preload: preloadPath,
    },
  });

  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    // Development: use Vite server
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // Production: use built React files
    mainWindow.loadFile(path.join(currentDir, '../dist/index.html'));
    // Ensure devtools is closed in prod
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    }
    mainWindow.webContents.once('did-finish-load', () => {
      // Block Ctrl+Shift+I and F12 in production
      mainWindow!.webContents.on('before-input-event', (event, input) => {
        if ((input.control && input.shift && input.key === 'I') || input.key === 'F12') {
          event.preventDefault();
          mainWindow?.webContents.send('devtools-blocked');
        }
      });
    
      // Close devtools if opened any other way
      mainWindow!.webContents.on('devtools-opened', () => {
        mainWindow?.webContents.closeDevTools();
        mainWindow?.webContents.send('devtools-blocked');
      });
    });
  }
}

// Type-safe IPC handler
ipcMain.on('react-message', (event: IpcMainEvent, arg: any) => {
  console.log('Electron heard React say:', arg);
  event.reply('main-reply', 'Hello from the native desktop side!');
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});