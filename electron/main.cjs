const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

app.disableHardwareAcceleration();

let mainWindow;

const userDataPath = app.getPath('userData');
const envPath = path.join(userDataPath, '.env');

function loadEnv(filePath) {
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
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (fs.existsSync(envPath)) {
    loadApp();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'setup.html'));
  }
}

function loadApp() {
  loadEnv(envPath);
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('save-env', async (event, envData) => {
  try {
    let envString = '';
    for (const [key, value] of Object.entries(envData)) {
      envString += `${key}=${value}\n`;
    }
    fs.writeFileSync(envPath, envString);
    loadApp();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC: Secure Encrypt Handler (for token storage)
ipcMain.handle('secure-encrypt', async (event, plainText) => {
  try {
    // Handle empty/null input
    if (!plainText) {
      return '';
    }
    
    const algorithm = 'aes-256-gcm';
    const key = crypto.randomBytes(32); // 256-bit key
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(plainText, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Return as single string: key:iv:encrypted:authTag
    return `${key.toString('hex')}:${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
  } catch (error) {
    console.error('Encryption failed:', error.message);
    // Return empty string instead of throwing
    return '';
  }
});

// IPC: Secure Decrypt Handler (for token retrieval)
ipcMain.handle('secure-decrypt', async (event, encryptedData) => {
  try {
    // Handle null/undefined - return empty string (no stored token)
    if (!encryptedData) {
      return '';
    }
    
    // Validate format
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
      console.warn('Invalid encrypted data format. Expected 4 parts, got:', parts.length);
      return '';
    }
    
    const [keyHex, ivHex, encrypted, authTagHex] = parts;
    
    // Validate all parts are present and non-empty
    if (!keyHex || !ivHex || !encrypted || !authTagHex) {
      console.warn('Invalid encrypted data: missing parts');
      return '';
    }
    
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(keyHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error.message);
    // Return empty string instead of throwing - allows frontend to handle gracefully
    return '';
  }
});
