const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Le registre de commandes affiche un raccourci par plateforme : Cmd sur
  // macOS, Ctrl ailleurs — l'application livre aussi un installeur Windows.
  platform: process.platform,
  openFile: () => ipcRenderer.invoke('file:open'),
  openFolder: () => ipcRenderer.invoke('folder:open'),
  refreshFolder: (root) => ipcRenderer.invoke('folder:refresh', root),
  searchFolder: (payload) => ipcRenderer.invoke('folder:search', payload),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  watchFile: (p) => ipcRenderer.invoke('file:watch', p),
  exportPdf: (payload) => ipcRenderer.invoke('file:export-pdf', payload),
  exportPdfTo: (payload) => ipcRenderer.invoke('file:export-pdf-to', payload),
  listMarkdown: () => ipcRenderer.invoke('folder:list-markdown'),
  exportHtml: (payload) => ipcRenderer.invoke('file:export-html', payload),
  print: (payload) => ipcRenderer.invoke('file:print', payload),
  setDefaultMarkdown: () => ipcRenderer.invoke('app:set-default-md'),
  version: () => ipcRenderer.invoke('app:version'),
  ouvrirDepot: () => ipcRenderer.invoke('app:open-repo'),
  noterRecent: (chemin) => ipcRenderer.invoke('recent:add', chemin),
  onMenu: (channel, handler) => ipcRenderer.on(channel, handler),
  // Menu « Réglages… » (Cmd/Ctrl+,) : ouvre la modale de réglages.
  onSettings: (handler) => ipcRenderer.on('menu:settings', handler),
  onFileChanged: (handler) => ipcRenderer.on('file:changed', (_e, data) => handler(data)),
  onOpenExternal: (handler) => ipcRenderer.on('file:open-external', (_e, data) => handler(data)),
});
