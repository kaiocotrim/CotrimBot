const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cotrimSetup", {
  submit: url => ipcRenderer.invoke("setup:submit", url),
  cancel: () => ipcRenderer.send("setup:cancel"),
});
