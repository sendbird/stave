import { ipcRenderer } from "electron";
import {
  API_CONNECTION_IPC,
  type ApiConnectionsBridgeApi,
} from "../../src/lib/providers/api-connections";

/** Connection metadata and key references only; key values stay in Electron main. */
export const apiConnectionsApi: ApiConnectionsBridgeApi = {
  list: () => ipcRenderer.invoke(API_CONNECTION_IPC.list),
  create: (args) => ipcRenderer.invoke(API_CONNECTION_IPC.create, args),
  update: (args) => ipcRenderer.invoke(API_CONNECTION_IPC.update, args),
  remove: (args) => ipcRenderer.invoke(API_CONNECTION_IPC.remove, args),
  check: (args) => ipcRenderer.invoke(API_CONNECTION_IPC.check, args),
  discoverModels: () => ipcRenderer.invoke(API_CONNECTION_IPC.discoverModels),
};
