import { app, safeStorage } from "electron";
import path from "node:path";
import { CraneConnectorCredentialVault } from "./credential-vault";

const VAULT_FILENAME = "crane-connector.v1.json";

let vault: CraneConnectorCredentialVault | null = null;

export function getCraneConnectorCredentialVault() {
  if (vault) {
    return vault;
  }
  vault = new CraneConnectorCredentialVault({
    filePath: path.join(app.getPath("userData"), VAULT_FILENAME),
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

export function resetCraneConnectorCredentialVaultForTests() {
  vault = null;
}
