import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveClaudeExecutablePath } from "../electron/providers/claude-sdk-runtime";
import {
  resolveClaudeCliExecutablePath,
  resolveCodexCliExecutablePath,
} from "../electron/providers/cli-path-env";
import { resolveCodexExecutablePath as resolveCodexAppServerExecutablePath } from "../electron/providers/codex-app-server-runtime";
import { resolveCodexExecutablePath as resolveCodexSdkExecutablePath } from "../electron/providers/codex-sdk-runtime";
import { __resetExecutablePathCachesForTests } from "../electron/providers/executable-path";

const createdDirectories: string[] = [];

afterEach(() => {
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();
    if (!directory) {
      continue;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

function createHomeExecutable(args: { prefix: string; commandName: string }) {
  const homeDirectory = process.env.HOME?.trim();
  if (!homeDirectory) {
    return null;
  }

  const directory = mkdtempSync(path.join(homeDirectory, args.prefix));
  createdDirectories.push(directory);
  const executablePath = path.join(directory, args.commandName);
  writeFileSync(executablePath, "#!/bin/sh\necho demo\n", "utf8");
  chmodSync(executablePath, 0o755);

  return {
    executablePath,
    tildePath: `~/${path.relative(homeDirectory, executablePath)}`,
    aliasPath: `${args.commandName}: aliased to ${executablePath}`,
  };
}

function withTemporaryEnv(
  values: Record<string, string | undefined>,
  run: () => void,
) {
  const previousValues = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previousValues.set(key, process.env[key]);
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }

  try {
    run();
  } finally {
    for (const [key, value] of previousValues.entries()) {
      if (typeof value === "string") {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
}

describe("provider executable resolution", () => {
  test("normalizes tilde-prefixed Claude binary overrides for tooling and runtime resolvers", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixture = createHomeExecutable({
      prefix: ".stave-claude-bin-",
      commandName: "claude",
    });
    if (!fixture) {
      return;
    }

    expect(
      resolveClaudeCliExecutablePath({ explicitPath: fixture.tildePath }),
    ).toBe(fixture.executablePath);
    expect(
      resolveClaudeExecutablePath({ explicitPath: fixture.tildePath }),
    ).toBe(fixture.executablePath);
  });

  test("normalizes alias-shaped Claude binary overrides for tooling and runtime resolvers", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixture = createHomeExecutable({
      prefix: ".stave-claude-alias-bin-",
      commandName: "claude",
    });
    if (!fixture) {
      return;
    }

    expect(
      resolveClaudeCliExecutablePath({ explicitPath: fixture.aliasPath }),
    ).toBe(fixture.executablePath);
    expect(
      resolveClaudeExecutablePath({ explicitPath: fixture.aliasPath }),
    ).toBe(fixture.executablePath);
  });

  test("uses the same normalized Claude env override path for tooling and runtime resolvers", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixture = createHomeExecutable({
      prefix: ".stave-claude-env-bin-",
      commandName: "claude",
    });
    if (!fixture) {
      return;
    }

    withTemporaryEnv(
      {
        STAVE_CLAUDE_CLI_PATH: fixture.tildePath,
        CLAUDE_CODE_PATH: undefined,
      },
      () => {
        expect(resolveClaudeCliExecutablePath()).toBe(fixture.executablePath);
        expect(resolveClaudeExecutablePath()).toBe(fixture.executablePath);
      },
    );
  });

  test("uses the same alias-shaped Claude env override path for tooling and runtime resolvers", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixture = createHomeExecutable({
      prefix: ".stave-claude-env-alias-bin-",
      commandName: "claude",
    });
    if (!fixture) {
      return;
    }

    withTemporaryEnv(
      {
        STAVE_CLAUDE_CLI_PATH: fixture.aliasPath,
        CLAUDE_CODE_PATH: undefined,
      },
      () => {
        expect(resolveClaudeCliExecutablePath()).toBe(fixture.executablePath);
        expect(resolveClaudeExecutablePath()).toBe(fixture.executablePath);
      },
    );
  });

  test("normalizes tilde-prefixed Codex binary overrides for tooling and both runtime backends", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixture = createHomeExecutable({
      prefix: ".stave-codex-bin-",
      commandName: "codex",
    });
    if (!fixture) {
      return;
    }

    expect(
      resolveCodexCliExecutablePath({ explicitPath: fixture.tildePath }),
    ).toBe(fixture.executablePath);
    expect(
      resolveCodexSdkExecutablePath({ explicitPath: fixture.tildePath }),
    ).toBe(fixture.executablePath);
    expect(
      resolveCodexAppServerExecutablePath({ explicitPath: fixture.tildePath }),
    ).toBe(fixture.executablePath);
  });

  test("normalizes alias-shaped Codex binary overrides for tooling and both runtime backends", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixture = createHomeExecutable({
      prefix: ".stave-codex-alias-bin-",
      commandName: "codex",
    });
    if (!fixture) {
      return;
    }

    expect(
      resolveCodexCliExecutablePath({ explicitPath: fixture.aliasPath }),
    ).toBe(fixture.executablePath);
    expect(
      resolveCodexSdkExecutablePath({ explicitPath: fixture.aliasPath }),
    ).toBe(fixture.executablePath);
    expect(
      resolveCodexAppServerExecutablePath({ explicitPath: fixture.aliasPath }),
    ).toBe(fixture.executablePath);
  });

  test("uses the same normalized Codex env override path for tooling and both runtime backends", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixture = createHomeExecutable({
      prefix: ".stave-codex-env-bin-",
      commandName: "codex",
    });
    if (!fixture) {
      return;
    }

    withTemporaryEnv(
      {
        STAVE_CODEX_CLI_PATH: fixture.tildePath,
      },
      () => {
        expect(resolveCodexCliExecutablePath()).toBe(fixture.executablePath);
        expect(resolveCodexSdkExecutablePath()).toBe(fixture.executablePath);
        expect(resolveCodexAppServerExecutablePath()).toBe(
          fixture.executablePath,
        );
      },
    );
  });

  test("uses the same alias-shaped Codex env override path for tooling and both runtime backends", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixture = createHomeExecutable({
      prefix: ".stave-codex-env-alias-bin-",
      commandName: "codex",
    });
    if (!fixture) {
      return;
    }

    withTemporaryEnv(
      {
        STAVE_CODEX_CLI_PATH: fixture.aliasPath,
      },
      () => {
        expect(resolveCodexCliExecutablePath()).toBe(fixture.executablePath);
        expect(resolveCodexSdkExecutablePath()).toBe(fixture.executablePath);
        expect(resolveCodexAppServerExecutablePath()).toBe(
          fixture.executablePath,
        );
      },
    );
  });

  test("auto-discovers a Codex binary installed under an nvm-managed Node version", () => {
    if (process.platform === "win32") {
      return;
    }

    const fakeNvmRoot = mkdtempSync(path.join(tmpdir(), "stave-fake-nvm-"));
    createdDirectories.push(fakeNvmRoot);
    const binDir = path.join(
      fakeNvmRoot,
      "versions",
      "node",
      "v24.14.1",
      "bin",
    );
    mkdirSync(binDir, { recursive: true });
    const codexPath = path.join(binDir, "codex");
    writeFileSync(
      codexPath,
      "#!/bin/sh\necho 'codex-cli 9.9.9'\n",
      "utf8",
    );
    chmodSync(codexPath, 0o755);

    withTemporaryEnv(
      {
        NVM_DIR: fakeNvmRoot,
        STAVE_CODEX_CLI_PATH: undefined,
        STAVE_CODEX_CMD: undefined,
      },
      () => {
        __resetExecutablePathCachesForTests();
        try {
          expect(resolveCodexCliExecutablePath()).toBe(codexPath);
          expect(resolveCodexSdkExecutablePath()).toBe(codexPath);
          expect(resolveCodexAppServerExecutablePath()).toBe(codexPath);
        } finally {
          __resetExecutablePathCachesForTests();
        }
      },
    );
  });
});
