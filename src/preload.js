"use strict";
const { contextBridge, ipcRenderer } = require("electron");

const arg = process.argv.find((a) => a.startsWith("--window="));
const windowType = arg ? arg.split("=")[1] : "buddy";

const listeners = new Map();

function on(channel, cb) {
  if (typeof cb !== "function") return () => {};
  const wrapped = (_event, data) => cb(data);
  ipcRenderer.on(channel, wrapped);
  listeners.set(cb, { channel, wrapped });
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
    listeners.delete(cb);
  };
}

contextBridge.exposeInMainWorld("bobby", {
  windowType,
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  on,
});
