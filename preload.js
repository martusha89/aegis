const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aegis', {
  // Terminal
  onData: (callback) => ipcRenderer.on('terminal:data', (_e, data) => callback(data)),
  onExit: (callback) => ipcRenderer.on('terminal:exit', (_e, code) => callback(code)),
  sendInput: (data) => ipcRenderer.send('terminal:input', data),
  resize: (cols, rows) => ipcRenderer.send('terminal:resize', { cols, rows }),

  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
});
