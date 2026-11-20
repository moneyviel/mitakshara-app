'use strict';
// The only door between the screen and the app's engine. Nothing else is exposed.
const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('mk', {
  call: (name, args) => ipcRenderer.invoke('mk', name, args),
  platform: process.platform,
  pathOf: (file) => webUtils.getPathForFile(file),
  onLocked: (fn) => ipcRenderer.on('locked', (_e, reason) => fn(reason)),
  onLicenceEnded: (fn) => ipcRenderer.on('licence-ended', (_e, msg) => fn(msg)),
});
