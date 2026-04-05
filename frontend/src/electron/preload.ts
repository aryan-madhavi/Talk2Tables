import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessageToMain: (message: string): void => {
    ipcRenderer.send('react-message', message);
  },

  onReplyFromMain: (callback: (response: string) => void): void => {
    // Listen for a reply and automatically cleanup after the response is received
    const listener = (event: IpcRendererEvent, response: string) => {
      callback(response);
      // Remove the listener after the callback is called
      ipcRenderer.removeListener('main-reply', listener);
    };
    ipcRenderer.on('main-reply', listener);
  },

  // Optional: a safer one-time listener
  onceReplyFromMain: (callback: (response: string) => void): void => {
    ipcRenderer.once('main-reply', (event: IpcRendererEvent, response: string) => {
      callback(response);
    });
  },

  // Display message for blocked devtools
  onDevToolsBlocked: (callback: () => void) => {
    ipcRenderer.on('devtools-blocked', () => callback());
  },
});