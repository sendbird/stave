import { app, safeStorage } from "electron";
import path from "node:path";
import type { SecretUpsertInput } from "../../../src/lib/secrets/secrets";
import { SecretVault } from "./secret-vault";

const VAULT_FILENAME = "secrets.v1.json";

let vault: SecretVault | null = null;

function getVault(): SecretVault {
  if (vault) {
    return vault;
  }
  vault = new SecretVault({
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

export async function listSecrets() {
  return getVault().list();
}

export async function upsertSecret(input: SecretUpsertInput) {
  return getVault().upsert(input);
}

export async function deleteSecret(id: string) {
  return getVault().delete(id);
}

export async function revealSecret(id: string) {
  return getVault().reveal(id);
}
