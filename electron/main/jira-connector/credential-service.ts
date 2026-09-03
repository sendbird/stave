import { app, safeStorage } from "electron";
import path from "node:path";

import { JiraConnectorCredentialVault } from "./credential-vault";

const VAULT_FILENAME = "jira-connector.v1.json";

let vault: JiraConnectorCredentialVault | null = null;

export function getJiraConnectorCredentialVault() {
  if (vault) return vault;
  vault = new JiraConnectorCredentialVault({
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

export function resetJiraConnectorCredentialVaultForTests() {
  vault = null;
}
