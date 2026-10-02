import { ipcRenderer } from "electron";
import {
  PROVIDER_ACCOUNT_IPC,
  type ProviderAccountsBridgeApi,
} from "../../src/lib/providers/provider-accounts";
import { providerAccountDetailsApi } from "./details-preload";

export const providerAccountsApi: ProviderAccountsBridgeApi = {
  checkGateway: (args) => ipcRenderer.invoke(PROVIDER_ACCOUNT_IPC.checkGateway, args),
  list: () => ipcRenderer.invoke(PROVIDER_ACCOUNT_IPC.list),
  create: (args) => ipcRenderer.invoke(PROVIDER_ACCOUNT_IPC.create, args),
  rename: (args) => ipcRenderer.invoke(PROVIDER_ACCOUNT_IPC.rename, args),
  remove: (args) => ipcRenderer.invoke(PROVIDER_ACCOUNT_IPC.remove, args),
  login: (args) => ipcRenderer.invoke(PROVIDER_ACCOUNT_IPC.login, args),
  ...providerAccountDetailsApi,
};
