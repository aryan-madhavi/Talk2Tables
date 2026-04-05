const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveEnv: (envData) => ipcRenderer.invoke('save-env', envData),
  encrypt: (plainText) => ipcRenderer.invoke('secure-encrypt', plainText),
  decrypt: (cipherText) => ipcRenderer.invoke('secure-decrypt', cipherText)
});
