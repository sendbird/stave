import {
  getAtelierConnectorCredentialVault,
  resetAtelierConnectorCredentialVaultForTests,
} from "../atelier-connector/credential-service";

export function getCraneConnectorCredentialVault() {
  return getAtelierConnectorCredentialVault();
}

export function resetCraneConnectorCredentialVaultForTests() {
  resetAtelierConnectorCredentialVaultForTests();
}
