import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

app.disableHardwareAcceleration();

const currentDir = __dirname;
let mainWindow: BrowserWindow | null = null;

const userDataPath = app.getPath('userData');
const envPath = path.join(userDataPath, '.env');

function loadEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    content.split('\n').forEach(line => {
      const parts = line.split('=');
      const key = parts[0];
      const value = parts.slice(1).join('=');
      if (key && value !== undefined) {
        process.env[key.trim()] = value.trim();
      }
    });
    console.log('Environment variables loaded from:', filePath);
  } catch (err) {
    console.error('Failed to parse .env file:', err);
  }
}

function createWindow() {
  const preloadPath = app.isPackaged
    ? path.join(process.resourcesPath, 'preload', 'preload.js')
    : path.join(currentDir, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Block devtools in production
  if (app.isPackaged) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow!.webContents.on('before-input-event', (event, input) => {
        if ((input.control && input.shift && input.key === 'I') || input.key === 'F12') {
          event.preventDefault();
          mainWindow?.webContents.send('devtools-blocked');
        }
      });
      mainWindow!.webContents.on('devtools-opened', () => {
        mainWindow?.webContents.closeDevTools();
        mainWindow?.webContents.send('devtools-blocked');
      });
    });
  }

  if (fs.existsSync(envPath)) {
    loadApp();
  } else {
    // setup.html: in dev it lives next to main.ts; in prod it's in extraResources
    const setupPath = app.isPackaged
      ? path.join(process.resourcesPath, 'setup.html')
      : path.join(currentDir, 'setup.html');
    mainWindow.loadFile(setupPath);
  }
}

function loadApp() {
  loadEnv(envPath);
  if (app.isPackaged) {
    mainWindow!.loadFile(path.join(currentDir, '../dist/index.html'));
  } else {
    mainWindow!.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
  }
}

ipcMain.handle('save-env', async (_event, envData: Record<string, string>) => {
  try {
    const envString = Object.entries(envData).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
    fs.writeFileSync(envPath, envString);
    loadApp();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('secure-encrypt', async (_event, plainText: string) => {
  try {
    if (!plainText) return '';
    const algorithm = 'aes-256-gcm';
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(plainText, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${key.toString('hex')}:${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
  } catch (error: any) {
    console.error('Encryption failed:', error.message);
    return '';
  }
});

ipcMain.handle('secure-decrypt', async (_event, encryptedData: string) => {
  try {
    if (!encryptedData) return '';
    const parts = encryptedData.split(':');
    if (parts.length !== 4) { console.warn('Invalid encrypted data format'); return ''; }
    const [keyHex, ivHex, encrypted, authTagHex] = parts;
    if (!keyHex || !ivHex || !encrypted || !authTagHex) { console.warn('Invalid encrypted data: missing parts'); return ''; }
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  } catch (error: any) {
    console.error('Decryption failed:', error.message);
    return '';
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
