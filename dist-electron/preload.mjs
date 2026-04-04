"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  sendMessageToMain: (message) => electron.ipcRenderer.send("react-message", message),
  onReplyFromMain: (callback) => {
    electron.ipcRenderer.on("main-reply", callback);
  }
});
