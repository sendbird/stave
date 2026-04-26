import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  getStaveLocalMcpConfigPath,
  readStaveLocalMcpConfig,
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
});
