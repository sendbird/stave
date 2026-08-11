import { app, safeStorage } from "electron";
import path from "node:path";

import { AtelierConnectorCredentialVault } from "./credential-vault";

const VAULT_FILENAME = "atelier-connector.v1.json";
const LEGACY_CRANE_VAULT_FILENAME = "crane-connector.v1.json";

let vault: AtelierConnectorCredentialVault | null = null;

export function getAtelierConnectorCredentialVault() {
  if (vault) return vault;
  const userDataPath = app.getPath("userData");
  vault = new AtelierConnectorCredentialVault({
    filePath: path.join(userDataPath, VAULT_FILENAME),
    legacyCraneFilePath: path.join(userDataPath, LEGACY_CRANE_VAULT_FILENAME),
    crypto: {
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
      isInsecureBackend: () =>
        process.platform === "linux" &&
        safeStorage.getSelectedStorageBackend() === "basic_text",
      encryptString: (value) => safeStorage.encryptString(value),
      decryptString: (value) => safeStorage.decryptString(value),
    },
  });
  return vault;
}

export function resetAtelierConnectorCredentialVaultForTests() {
  vault = null;
}
