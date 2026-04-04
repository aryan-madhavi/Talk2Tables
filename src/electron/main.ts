import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// 👇 Name these something else so Vite doesn't mess with them!
const currentPath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentPath);

let mainWindow: BrowserWindow | null = null;

function createWindow(){
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            // 👇 Use currentDir here
            preload: path.join(currentDir, 'preload.mjs'),
        },
    });

    if (process.env.VITE_DEV_SERVER_URL){
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools();
    }
    else {
        // 👇 Use currentDir here too
        mainWindow.loadFile(path.join(currentDir, '../dist/index.html'));
    }
}

app.on('ready', createWindow);

ipcMain.on('react-message', (event, arg)=> {
    console.log("Electron heard React Say: ", arg);
    event.reply('main-reply', 'Hello from the native desktop side!');
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});