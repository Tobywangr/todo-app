const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  collapse: () => ipcRenderer.invoke('window-collapse'),
  expand: () => ipcRenderer.invoke('window-expand'),
  startDrag: () => ipcRenderer.send('window-drag-start'),
  moveDrag: () => ipcRenderer.send('window-drag-move'),
  stopDrag: () => ipcRenderer.send('window-drag-stop'),
});
