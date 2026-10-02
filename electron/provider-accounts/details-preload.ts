import { ipcRenderer } from "electron";
import {
  PROVIDER_ACCOUNT_IDENTITY_IPC,
  type ProviderAccountIdentityBridgeApi,
} from "../../src/lib/providers/provider-account-identity";
import {
  PROVIDER_ACCOUNT_SETUP_IPC,
  type ProviderAccountSetupBridgeApi,
} from "../../src/lib/providers/provider-account-setup";

/** Sign-in identity and shared-setup calls, spread into `window.api.providerAccounts`. */
export const providerAccountDetailsApi: ProviderAccountIdentityBridgeApi & ProviderAccountSetupBridgeApi = {
  identity: (args) => ipcRenderer.invoke(PROVIDER_ACCOUNT_IDENTITY_IPC.identity, args),
  setupStatus: (args) => ipcRenderer.invoke(PROVIDER_ACCOUNT_SETUP_IPC.setupStatus, args),
  shareSetup: (args) => ipcRenderer.invoke(PROVIDER_ACCOUNT_SETUP_IPC.shareSetup, args),
};
