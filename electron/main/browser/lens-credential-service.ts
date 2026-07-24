import { app, safeStorage } from "electron";
import path from "node:path";
import type {
  LensCredentialFillResult,
  LensCredentialUpsertInput,
} from "../../../src/lib/lens/lens-credentials";
import { LensCredentialVault } from "./lens-credential-vault";

const VAULT_FILENAME = "lens-credentials.v1.json";

let vault: LensCredentialVault | null = null;

function getVault(): LensCredentialVault {
  if (vault) {
    return vault;
  }
  vault = new LensCredentialVault({
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

export async function listLensCredentials() {
  return getVault().list();
}

export async function upsertLensCredential(input: LensCredentialUpsertInput) {
  return getVault().upsert(input);
}

export async function deleteLensCredential(id: string) {
  return getVault().delete(id);
}

function buildCredentialFillScript(args: {
  username: string;
  password: string;
  submit: boolean;
}): string {
  const payload = JSON.stringify(args);
  return `(() => {
    const credential = ${payload};
    const isUsable = (element) => Boolean(
      element &&
      !element.disabled &&
      !element.readOnly &&
      element.getClientRects().length > 0
    );
    const inputs = Array.from(document.querySelectorAll("input"));
    const passwordInput = inputs.find((input) =>
      isUsable(input) &&
      input.autocomplete === "current-password"
    ) ?? inputs.find((input) =>
      isUsable(input) &&
      input.type === "password" &&
      input.autocomplete !== "new-password"
    );
    const form = passwordInput?.form ?? null;
    const candidates = passwordInput
      ? (form ? Array.from(form.querySelectorAll("input")) : inputs)
      : [];
    const usernameInput = candidates.find((input) =>
      isUsable(input) &&
      input !== passwordInput &&
      ["username", "email"].includes(input.autocomplete)
    ) ?? candidates.find((input) =>
      isUsable(input) &&
      input !== passwordInput &&
      (input.type === "email" || /user|email|login/i.test(input.name || input.id))
    ) ?? candidates.find((input) =>
      isUsable(input) && input !== passwordInput && input.type === "text"
    );
    const setValue = (input, value) => {
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };
    const filledUsername = setValue(usernameInput, credential.username);
    const filledPassword = setValue(passwordInput, credential.password);
    let submitted = false;
    if (credential.submit && filledPassword && form) {
      const submitButton = form.querySelector(
        'button[type="submit"], input[type="submit"], button:not([type])',
      );
      if (submitButton instanceof HTMLElement) {
        submitButton.click();
        submitted = true;
      } else if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
        submitted = true;
      }
    }
    return { filledUsername, filledPassword, submitted };
  })()`;
}

export async function fillLensCredentialForWebContents(
  webContents: Electron.WebContents,
  options?: {
    autoFillOnly?: boolean;
    submit?: boolean;
    username?: string;
  },
): Promise<LensCredentialFillResult> {
  const url = webContents.getURL();
  const credential = await getVault().findForUrl(url, {
    autoFillOnly: options?.autoFillOnly,
    username: options?.username,
  });
  if (!credential) {
    return {
      ok: false,
      message: options?.username
        ? "No saved Lens account matches that username on the current hostname."
        : "No unambiguous saved Lens account matches the current hostname. Choose a username or mark one account for automatic fill in Settings > Lens.",
    };
  }

  const result = (await webContents.executeJavaScript(
    buildCredentialFillScript({
      username: credential.username,
      password: credential.password,
      submit: options?.submit === true,
    }),
    true,
  )) as {
    filledUsername?: unknown;
    filledPassword?: unknown;
    submitted?: unknown;
  };
  const filledUsername = result.filledUsername === true;
  const filledPassword = result.filledPassword === true;
  const submitted = result.submitted === true;
  if (!filledUsername && !filledPassword) {
    return {
      ok: false,
      host: credential.matchedHost,
      filledUsername,
      filledPassword,
      submitted,
      message: "No visible username or password fields were found.",
    };
  }
  return {
    ok: true,
    host: credential.matchedHost,
    filledUsername,
    filledPassword,
    submitted,
  };
}
