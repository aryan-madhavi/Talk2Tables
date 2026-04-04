import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    sendMessageToMain: (message: string) => ipcRenderer.send('react-message', message),

    onReplyFromMain: (callback: (event: any, response: string) => void) => {
    ipcRenderer.on('main-reply', callback);
  }
});

