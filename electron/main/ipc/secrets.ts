import { ipcMain } from "electron";
import {
  deleteSecret,
  listSecrets,
  revealSecret,
  upsertSecret,
} from "../browser/secret-service";
import {
  SecretDeleteArgsSchema,
  SecretRevealArgsSchema,
  SecretUpsertArgsSchema,
} from "./schemas";

/**
 * Secret store: values stay in the Electron main-process vault (OS-encrypted)
 * and are only returned to the renderer through the explicit reveal handler.
 */
export function registerSecretHandlers() {
  ipcMain.handle("secrets:list", async () => {
    try {
      return { ok: true, secrets: await listSecrets() };
    } catch (err) {
      return {
        ok: false,
        secrets: [],
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle("secrets:upsert", async (_event, args: unknown) => {
    const parsed = SecretUpsertArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid secret details." };
    }
    try {
      return { ok: true, secret: await upsertSecret(parsed.data) };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle("secrets:delete", async (_event, args: unknown) => {
    const parsed = SecretDeleteArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid secret id." };
    }
    try {
      const deleted = await deleteSecret(parsed.data.id);
      return {
        ok: deleted,
        message: deleted ? undefined : "The saved secret no longer exists.",
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });

  ipcMain.handle("secrets:reveal", async (_event, args: unknown) => {
    const parsed = SecretRevealArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, message: "Invalid secret id." };
    }
    try {
      const result = await revealSecret(parsed.data.id);
      if (!result) {
        return { ok: false, message: "The saved secret no longer exists." };
      }
      return { ok: true, value: result.value };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });
}
