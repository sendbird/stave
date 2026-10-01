import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProviderAccountLoginSession } from "../electron/host-service/provider-account-login";
import { ProviderAccountRegistry } from "../electron/provider-accounts/registry";
import { workspaceExecutionGate } from "../electron/shared/workspace-execution-gate";
import {
  PROVIDER_ACCOUNT_IPC,
  SYSTEM_ACCOUNT_PROFILE_ID,
  type ProviderAccountLoginArgs,
} from "../src/lib/providers/provider-accounts";

const handlers = new Map<
  string,
  (_event: unknown, args?: unknown) => unknown
>();
const hostCalls: Array<{ method: string; args: ProviderAccountLoginArgs }> = [];
const launches: Array<{
  command: string;
  commandArgs: string[];
  env: Record<string, string>;
  slotKey: string;
  deliveryMode: string;
  persistScreenState: boolean;
}> = [];
const slots = new Map<
  string,
  { sessionId: string; session: { closing: boolean } }
>();
let failSpawn = false;

mock.module("electron", () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (_event: unknown, args?: unknown) => unknown,
    ) => handlers.set(channel, handler),
  },
  ipcRenderer: {
    invoke: async (channel: string, args?: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) throw new Error("Missing IPC handler");
      return JSON.parse(JSON.stringify(await handler({}, args)));
    },
  },
}));
mock.module("../electron/main/host-service-client", () => ({
  invokeHostService: async (
    method: string,
    input: ProviderAccountLoginArgs,
  ) => {
    const args = JSON.parse(JSON.stringify(input)) as ProviderAccountLoginArgs;
    hostCalls.push({ method, args });
    if (method !== "terminal.create-provider-login-session")
      throw new Error("Unexpected host request");
    return createProviderAccountLoginSession(args, {
      getSessionBySlotKey: (slotKey) => slots.get(slotKey) ?? null,
      createPtySession: (launch) => {
        if (failSpawn) throw new Error("Fixture spawn failure");
        launches.push(launch);
        const sessionId = `login-session-${launches.length}`;
        slots.set(launch.slotKey, { sessionId, session: { closing: false } });
        return sessionId;
      },
    });
  },
}));
const { registerProviderAccountHandlers } = await import(
  "../electron/main/ipc/provider-accounts"
);
const { providerAccountsApi } = await import(
  "../electron/provider-accounts/preload"
);

let root: string;
let registry: ProviderAccountRegistry;
let previousUserDataPath: string | undefined;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "stave-account-ipc-"));
  previousUserDataPath = process.env.STAVE_USER_DATA_PATH;
  process.env.STAVE_USER_DATA_PATH = root;
  registry = new ProviderAccountRegistry(root);
  handlers.clear();
  hostCalls.length = 0;
  launches.length = 0;
  slots.clear();
  failSpawn = false;
  registerProviderAccountHandlers();
});
afterEach(() => {
  workspaceExecutionGate.resume("account-test-workspace");
  if (previousUserDataPath === undefined)
    delete process.env.STAVE_USER_DATA_PATH;
  else process.env.STAVE_USER_DATA_PATH = previousUserDataPath;
  rmSync(root, { recursive: true, force: true });
});
function loginArgs(
  providerId: "claude-code" | "codex",
  profileId: string,
): ProviderAccountLoginArgs {
  return {
    providerId,
    profileId,
    workspaceId: "account-test-workspace",
    workspacePath: root,
    binaryPath: process.execPath,
  };
}

describe("provider account preload → validated IPC → native login", () => {
  test("covers every bridge channel and returns only nonsecret registry metadata", async () => {
    expect([...handlers.keys()].sort()).toEqual(
      Object.values(PROVIDER_ACCOUNT_IPC).sort(),
    );
    const created = await providerAccountsApi.create({
      providerId: "claude-code",
      label: "Account",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.message);
    writeFileSync(
      path.join(created.profile.configDirectory!, "native-auth-fixture"),
      "fixture-private-auth",
    );
    const renamed = await providerAccountsApi.rename({
      providerId: "claude-code",
      id: created.profile.id,
      label: "Renamed",
    });
    expect(renamed.ok).toBe(true);
    const listed = await providerAccountsApi.list();
    expect(listed.ok).toBe(true);
    expect(listed.profiles.at(-1)?.label).toBe("Renamed");
    expect(JSON.stringify(listed)).not.toContain("fixture-private-auth");
    expect(readFileSync(registry.filePath, "utf8")).not.toContain(
      "fixture-private-auth",
    );
    expect(
      await providerAccountsApi.remove({
        providerId: "claude-code",
        id: created.profile.id,
      }),
    ).toEqual({ ok: true });
    expect(
      readFileSync(
        path.join(created.profile.configDirectory!, "native-auth-fixture"),
        "utf8",
      ),
    ).toBe("fixture-private-auth");
  });

  test("rejects credential fields, raw runtime directories, resume ids, and unsupported providers before host dispatch", async () => {
    for (const input of [
      {
        ...loginArgs("codex", SYSTEM_ACCOUNT_PROFILE_ID),
        configDirectory: root,
      },
      {
        ...loginArgs("codex", SYSTEM_ACCOUNT_PROFILE_ID),
        nativeSessionId: "another-account-session",
      },
      {
        ...loginArgs("codex", SYSTEM_ACCOUNT_PROFILE_ID),
        providerId: "cursor",
      },
      {
        ...loginArgs("codex", SYSTEM_ACCOUNT_PROFILE_ID),
        profileId: "invalid",
      },
      {
        ...loginArgs("codex", SYSTEM_ACCOUNT_PROFILE_ID),
        oauthToken: "fixture-token",
      },
    ]) {
      expect((await providerAccountsApi.login(input as never)).ok).toBe(false);
    }
    expect(
      (
        await providerAccountsApi.create({
          providerId: "codex",
          label: "Account",
          apiKey: "fixture-token",
        } as never)
      ).ok,
    ).toBe(false);
    expect(hostCalls).toHaveLength(0);
    expect(launches).toHaveLength(0);
    expect(registry.list()).toHaveLength(2);
  });

  for (const providerId of ["claude-code", "codex"] as const) {
    test(`${providerId} runs fixed native login commands in distinct profile slots`, async () => {
      const a = registry.create({ providerId, label: "A" });
      const b = registry.create({ providerId, label: "B" });
      const first = await providerAccountsApi.login(
        loginArgs(providerId, a.id),
      );
      const second = await providerAccountsApi.login(
        loginArgs(providerId, b.id),
      );
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      const key = providerId === "codex" ? "CODEX_HOME" : "CLAUDE_CONFIG_DIR";
      expect(launches[0]!.env[key]).toBe(a.configDirectory!);
      expect(launches[1]!.env[key]).toBe(b.configDirectory!);
      expect(launches[0]!.slotKey).not.toBe(launches[1]!.slotKey);
      expect(launches[0]!.commandArgs).toEqual(
        providerId === "codex" ? ["login"] : ["auth", "login"],
      );
      expect(launches[0]!.deliveryMode).toBe("poll");
      expect(launches[0]!.persistScreenState).toBe(false);
      expect(hostCalls[0]!.method).toBe(
        "terminal.create-provider-login-session",
      );
      expect(hostCalls[0]!.args).not.toHaveProperty("env");
      expect(
        await providerAccountsApi.login(loginArgs(providerId, a.id)),
      ).toEqual(first);
      expect(launches).toHaveLength(2);
      registry.remove({ providerId, id: a.id });
      const removed = await providerAccountsApi.login(
        loginArgs(providerId, a.id),
      );
      expect(removed.ok).toBe(false);
      expect(launches).toHaveLength(2);
    });
  }

  test("a wrong-provider id or failed spawn does not change another profile or existing login", async () => {
    const a = registry.create({ providerId: "codex", label: "A" });
    const b = registry.create({ providerId: "codex", label: "B" });
    const active = await providerAccountsApi.login(loginArgs("codex", a.id));
    expect(active.ok).toBe(true);
    expect(
      (await providerAccountsApi.login(loginArgs("claude-code", a.id))).ok,
    ).toBe(false);
    failSpawn = true;
    const failed = await providerAccountsApi.login(loginArgs("codex", b.id));
    expect(failed).toEqual({ ok: false, message: "Fixture spawn failure" });
    expect(await providerAccountsApi.login(loginArgs("codex", a.id))).toEqual(
      active,
    );
    expect(launches).toHaveLength(1);
    expect(registry.list().slice(2)).toEqual([a, b]);
  });

  test("stopped workspaces cannot start a login subprocess", async () => {
    await workspaceExecutionGate.stop(
      { workspaceId: "account-test-workspace", workspacePath: root },
      async () => {},
    );
    const result = await providerAccountsApi.login(
      loginArgs("codex", SYSTEM_ACCOUNT_PROFILE_ID),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected the workspace execution gate");
    expect(result.message).toContain("Workspace execution is stopped");
    expect(launches).toHaveLength(0);
  });
});
