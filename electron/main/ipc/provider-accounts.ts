import { ipcMain } from "electron";
import { checkStoredApiConnection } from "../api-connection-check";
import { revealSecret } from "../browser/secret-service";
import {
  PROVIDER_ACCOUNT_IPC,
  ProviderAccountCreateArgsSchema,
  ProviderAccountLoginArgsSchema,
  ProviderAccountRenameArgsSchema,
  ProviderAccountRemoveArgsSchema,
} from "../../../src/lib/providers/provider-accounts";
import { getProviderAccountRegistry } from "../../provider-accounts/registry";
import { invokeHostService } from "../host-service-client";

function failure(error: unknown) {
  return {
    ok: false as const,
    message:
      error instanceof Error
        ? error.message
        : "Provider account operation failed.",
  };
}

export function registerProviderAccountHandlers() {
  ipcMain.handle(PROVIDER_ACCOUNT_IPC.checkGateway, async (_event, input: unknown) => {
    const parsed = ProviderAccountRemoveArgsSchema.safeParse(input);
    if (!parsed.success || parsed.data.providerId !== "claude-code")
      return { ok: false, models: [], message: "Invalid Gateway connection." };
    // A Claude gateway is an API connection now; answer in this channel's older shape.
    const result = await checkStoredApiConnection(parsed.data.id, revealSecret);
    return { ok: result.ok, message: result.message, models: [] };
  });
  ipcMain.handle(PROVIDER_ACCOUNT_IPC.list, () => {
    try {
      return { ok: true, profiles: getProviderAccountRegistry().list() };
    } catch (error) {
      return { ...failure(error), profiles: [] };
    }
  });
  ipcMain.handle(PROVIDER_ACCOUNT_IPC.create, (_event, input: unknown) => {
    const parsed = ProviderAccountCreateArgsSchema.safeParse(input);
    if (!parsed.success)
      return failure(new Error("Invalid provider account details."));
    try {
      return {
        ok: true,
        profile: getProviderAccountRegistry().create(parsed.data),
      };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.handle(PROVIDER_ACCOUNT_IPC.rename, (_event, input: unknown) => {
    const parsed = ProviderAccountRenameArgsSchema.safeParse(input);
    if (!parsed.success)
      return failure(new Error("Invalid provider account details."));
    try {
      return {
        ok: true,
        profile: getProviderAccountRegistry().rename(parsed.data),
      };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.handle(PROVIDER_ACCOUNT_IPC.remove, (_event, input: unknown) => {
    const parsed = ProviderAccountRemoveArgsSchema.safeParse(input);
    if (!parsed.success)
      return failure(new Error("Invalid provider account id."));
    try {
      getProviderAccountRegistry().remove(parsed.data);
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.handle(PROVIDER_ACCOUNT_IPC.login, async (_event, input: unknown) => {
    const parsed = ProviderAccountLoginArgsSchema.safeParse(input);
    if (!parsed.success)
      return failure(new Error("Invalid provider account login request."));
    try {
      const result = await invokeHostService(
        "terminal.create-provider-login-session",
        parsed.data,
      );
      return result.ok && result.sessionId
        ? { ok: true, sessionId: result.sessionId }
        : failure(
            new Error(result.stderr || "Native login could not be started."),
          );
    } catch (error) {
      return failure(error);
    }
  });
}
