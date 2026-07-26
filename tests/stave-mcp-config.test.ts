import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempDirs: string[] = [];
let currentUserDataPath = "";

mock.module("electron", () => ({
  app: {
    getPath(name: string) {
      if (name !== "userData") {
        throw new Error(`Unexpected electron app path request: ${name}`);
      }
      return currentUserDataPath;
    },
  },
}));

const {
  DEFAULT_LOCAL_MCP_PORT,
  LOCAL_MCP_CONFIG_VERSION,
  getStaveLocalMcpConfigPath,
  migrateLocalMcpConfigPort,
  readStaveLocalMcpConfig,
  updateStaveLocalMcpConfig,
} = await import("../electron/main/stave-mcp-config");

function createTempUserDataDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "stave-local-mcp-config-"));
  tempDirs.push(directory);
  currentUserDataPath = directory;
  return directory;
}

afterEach(() => {
  currentUserDataPath = "";
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  mock.restore();
});

describe("stave local MCP config", () => {
  test("defaults CLI auto-registration to off until the user enables it", async () => {
    const userDataPath = createTempUserDataDirectory();

    const config = await readStaveLocalMcpConfig();

    expect(config.enabled).toBe(true);
    expect(config.claudeCodeAutoRegister).toBe(false);
    expect(config.codexAutoRegister).toBe(false);

    const saved = JSON.parse(readFileSync(getStaveLocalMcpConfigPath(), "utf8")) as {
      enabled: boolean;
      claudeCodeAutoRegister: boolean;
      codexAutoRegister: boolean;
    };

    expect(getStaveLocalMcpConfigPath()).toBe(path.join(userDataPath, "stave-local-mcp-settings.json"));
    expect(saved.enabled).toBe(true);
    expect(saved.claudeCodeAutoRegister).toBe(false);
    expect(saved.codexAutoRegister).toBe(false);
  });

  test("defaults to a stable port so restarts keep the endpoint valid", async () => {
    createTempUserDataDirectory();

    const config = await readStaveLocalMcpConfig();

    expect(config.port).toBe(DEFAULT_LOCAL_MCP_PORT);
    expect(config.configVersion).toBe(LOCAL_MCP_CONFIG_VERSION);
  });

  test("migrates the legacy ephemeral-port default onto the stable port", async () => {
    createTempUserDataDirectory();
    writeFileSync(
      getStaveLocalMcpConfigPath(),
      JSON.stringify({
        enabled: true,
        port: 0,
        token: "legacy-token",
        claudeCodeAutoRegister: false,
        codexAutoRegister: false,
      }),
    );

    const config = await readStaveLocalMcpConfig();

    expect(config.port).toBe(DEFAULT_LOCAL_MCP_PORT);
    expect(config.token).toBe("legacy-token");
    expect(config.configVersion).toBe(LOCAL_MCP_CONFIG_VERSION);
  });

  test("keeps automatic port selection once the user chooses it explicitly", async () => {
    createTempUserDataDirectory();
    await readStaveLocalMcpConfig();

    const updated = await updateStaveLocalMcpConfig({ port: 0 });
    expect(updated.port).toBe(0);

    // The migration must not fight the user's choice on the next read.
    expect((await readStaveLocalMcpConfig()).port).toBe(0);
  });

  test("only migrates the port for configs written before the current version", () => {
    expect(migrateLocalMcpConfigPort({ port: 0, configVersion: undefined })).toBe(
      DEFAULT_LOCAL_MCP_PORT,
    );
    expect(
      migrateLocalMcpConfigPort({
        port: 0,
        configVersion: LOCAL_MCP_CONFIG_VERSION,
      }),
    ).toBe(0);
    expect(migrateLocalMcpConfigPort({ port: 8_123, configVersion: 1 })).toBe(
      8_123,
    );
  });
});
