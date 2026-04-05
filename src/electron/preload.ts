import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveEnv: (envData: Record<string, string>) =>
    ipcRenderer.invoke('save-env', envData),

  encrypt: (plainText: string) =>
    ipcRenderer.invoke('secure-encrypt', plainText),

  decrypt: (cipherText: string) =>
    ipcRenderer.invoke('secure-decrypt', cipherText),

  onDevToolsBlocked: (callback: () => void) =>
    ipcRenderer.on('devtools-blocked', () => callback()),
});
