import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildExecutableLookupEnv,
  __resetExecutablePathCachesForTests,
  __setLoginShellProbeTimeoutMsForTests,
  normalizeExecutablePathValue,
  parseMarkedProbeOutput,
  prepareExecutableLookup,
  resolveExecutablePath,
  resolveLoginShellCommandPath,
  refreshLoginShellEnvVarValues,
  resolveLoginShellEnvVarValues,
  resolveLoginShellEnvVarValuesAsync,
  toAsarUnpackedPath,
} from "../electron/providers/executable-path";
import {
  __resetCliExecutableDiscoveryForTests,
  prepareCliExecutableDiscovery,
  resolveClaudeCliExecutablePath,
  resolveCodexCliExecutablePath,
} from "../electron/providers/cli-path-env";

const tempDirs: string[] = [];

test("async executable discovery batches shell startup and warms synchronous consumers", async () => {
  if (process.platform === "win32") return;
  const { executablePath, directory } = createExecutableFixture({
    prefix: "stave-discovery-",
  });
  const countPath = path.join(directory, "launches");
  writeFileSync(
    executablePath,
    `#!/bin/sh\necho launch >> '${countPath}'\nsleep 0.1\nprintf '__STAVE_LOGIN_SHELL_PATH__${directory}__STAVE_LOGIN_SHELL_PATH____STAVE_EXECUTABLE_0__${executablePath}__STAVE_EXECUTABLE_0____STAVE_EXECUTABLE_1__${executablePath}__STAVE_EXECUTABLE_1__'\n`,
  );
  const originalShell = process.env.SHELL;
  __resetExecutablePathCachesForTests();
  try {
    process.env.SHELL = executablePath;
    let timerRan = false;
    const timer = setTimeout(() => {
      timerRan = true;
    }, 10);
    await Promise.all([
      prepareExecutableLookup(["demo", "demo-next", "INVALID;COMMAND"]),
      prepareExecutableLookup(["demo"]),
    ]);
    clearTimeout(timer);
    expect(timerRan).toBe(true);
    expect(resolveLoginShellCommandPath({ command: "demo" })).toBe(
      executablePath,
    );
    expect(resolveLoginShellCommandPath({ command: "demo-next" })).toBe(
      executablePath,
    );
    expect(buildExecutableLookupEnv().PATH?.split(path.delimiter)).toContain(
      directory,
    );
    expect((await Bun.file(countPath).text()).trim()).toBe("launch");
  } finally {
    if (originalShell === undefined) delete process.env.SHELL;
    else process.env.SHELL = originalShell;
    __resetExecutablePathCachesForTests();
  }
});

test("async shell environment lookup keeps the service loop responsive and shares validated parsing", async () => {
  if (process.platform === "win32") return;
  const { executablePath } = createExecutableFixture({
    prefix: "stave-async-shell-",
  });
  writeFileSync(
    executablePath,
    "#!/bin/sh\nsleep 0.1\nprintf '__STAVE_LOGIN_SHELL_ENV__STAVE_PROBE_TEST__example__STAVE_LOGIN_SHELL_ENV__STAVE_PROBE_TEST__'\n",
  );
  const originalShell = process.env.SHELL;
  let timerRan = false;
  try {
    process.env.SHELL = executablePath;
    const pending = resolveLoginShellEnvVarValuesAsync({
      keys: ["STAVE_PROBE_TEST", "INVALID;COMMAND"],
      cache: false,
    });
    const timer = setTimeout(() => {
      timerRan = true;
    }, 10);
    const result = await pending;
    clearTimeout(timer);
    expect(timerRan).toBe(true);
    expect(result).toEqual({ STAVE_PROBE_TEST: "example" });
  } finally {
    if (originalShell === undefined) delete process.env.SHELL;
    else process.env.SHELL = originalShell;
  }
});

test("async CLI discovery ranks slow version-manager candidates before a synchronous resolver reads them", async () => {
  if (process.platform === "win32") return;
  const nvmDirectory = mkdtempSync(path.join(tmpdir(), "stave-nvm-discovery-"));
  tempDirs.push(nvmDirectory);
  const binDirectory = path.join(
    nvmDirectory,
    "versions",
    "node",
    "v999.0.0",
    "bin",
  );
  mkdirSync(binDirectory, { recursive: true });
  const executablePath = path.join(binDirectory, "claude");
  const codexExecutablePath = path.join(binDirectory, "codex");
  const claudeCountPath = path.join(nvmDirectory, "claude-version-launches");
  const codexCountPath = path.join(nvmDirectory, "codex-version-launches");
  const shellPath = path.join(nvmDirectory, "login-shell");
  writeFileSync(shellPath, '#!/bin/sh\nexec /bin/sh -c "$2"\n');
  writeFileSync(
    executablePath,
    `#!/bin/sh\necho launch >> '${claudeCountPath}'\nsleep 0.1\nprintf '999.0.0\\n'\n`,
  );
  writeFileSync(
    codexExecutablePath,
    `#!/bin/sh\necho launch >> '${codexCountPath}'\nsleep 0.1\nprintf '999.0.0\\n'\n`,
  );
  chmodSync(executablePath, 0o755);
  chmodSync(codexExecutablePath, 0o755);
  chmodSync(shellPath, 0o755);
  const originalNvmDir = process.env.NVM_DIR;
  const originalShell = process.env.SHELL;
  const originalClaudePath = process.env.STAVE_CLAUDE_CLI_PATH;
  const originalClaudeCommand = process.env.STAVE_CLAUDE_CMD;
  __resetExecutablePathCachesForTests();
  __resetCliExecutableDiscoveryForTests();
  try {
    process.env.NVM_DIR = nvmDirectory;
    process.env.SHELL = shellPath;
    delete process.env.STAVE_CLAUDE_CLI_PATH;
    delete process.env.STAVE_CLAUDE_CMD;
    let timerRan = false;
    const timer = setTimeout(() => {
      timerRan = true;
    }, 10);
    await prepareCliExecutableDiscovery();
    clearTimeout(timer);
    expect(timerRan).toBe(true);
    expect(resolveClaudeCliExecutablePath()).toBe(executablePath);
    expect(resolveCodexCliExecutablePath()).toBe(codexExecutablePath);
    expect((await Bun.file(claudeCountPath).text()).trim()).toBe("launch");
    expect((await Bun.file(codexCountPath).text()).trim()).toBe("launch");
  } finally {
    if (originalNvmDir === undefined) delete process.env.NVM_DIR;
    else process.env.NVM_DIR = originalNvmDir;
    if (originalShell === undefined) delete process.env.SHELL;
    else process.env.SHELL = originalShell;
    if (originalClaudePath === undefined)
      delete process.env.STAVE_CLAUDE_CLI_PATH;
    else process.env.STAVE_CLAUDE_CLI_PATH = originalClaudePath;
    if (originalClaudeCommand === undefined) delete process.env.STAVE_CLAUDE_CMD;
    else process.env.STAVE_CLAUDE_CMD = originalClaudeCommand;
    __resetExecutablePathCachesForTests();
    __resetCliExecutableDiscoveryForTests();
  }
});

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (!directory) {
      continue;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

function createExecutableFixture(args: {
  prefix: string;
  underHome?: boolean;
}) {
  const baseDirectory = args.underHome
    ? process.env.HOME?.trim() || tmpdir()
    : tmpdir();
  const directory = mkdtempSync(path.join(baseDirectory, args.prefix));
  tempDirs.push(directory);
  const executablePath = path.join(
    directory,
    process.platform === "win32" ? "demo.cmd" : "demo",
  );
  writeFileSync(
    executablePath,
    process.platform === "win32"
      ? "@echo off\r\necho demo\r\n"
      : "#!/bin/sh\necho demo\n",
    "utf8",
  );
  chmodSync(executablePath, 0o755);
  return { directory, executablePath };
}

describe("resolveExecutablePath", () => {
  test("prefers an explicit executable path over PATH lookup", () => {
    const { executablePath } = createExecutableFixture({
      prefix: "stave-exec-",
    });

    const resolved = resolveExecutablePath({
      absolutePathEnvVar: "STAVE_TEST_ABSOLUTE_PATH",
      commandEnvVar: "STAVE_TEST_COMMAND",
      defaultCommand: "stave-command-that-does-not-exist",
      explicitPaths: [executablePath],
    });

    expect(resolved).toBe(executablePath);
  });

  test("normalizes alias-shaped explicit path candidates before validating them", () => {
    const { executablePath } = createExecutableFixture({
      prefix: "stave-exec-alias-",
    });

    const resolved = resolveExecutablePath({
      absolutePathEnvVar: "STAVE_TEST_ABSOLUTE_PATH",
      commandEnvVar: "STAVE_TEST_COMMAND",
      defaultCommand: "stave-command-that-does-not-exist",
      explicitPaths: [`demo: aliased to ${executablePath}`],
    });

    expect(resolved).toBe(executablePath);
  });

  test("expands tilde-prefixed absolute-path overrides before probing executables", () => {
    if (process.platform === "win32" || !process.env.HOME?.trim()) {
      return;
    }

    const originalAbsolutePath = process.env.STAVE_TEST_ABSOLUTE_PATH;
    const { executablePath } = createExecutableFixture({
      prefix: ".stave-exec-home-",
      underHome: true,
    });
    const homeDirectory = process.env.HOME.trim();
    process.env.STAVE_TEST_ABSOLUTE_PATH = `~/${path.relative(homeDirectory, executablePath)}`;

    try {
      const resolved = resolveExecutablePath({
        absolutePathEnvVar: "STAVE_TEST_ABSOLUTE_PATH",
        commandEnvVar: "STAVE_TEST_COMMAND",
        defaultCommand: "stave-command-that-does-not-exist",
      });

      expect(resolved).toBe(executablePath);
    } finally {
      if (typeof originalAbsolutePath === "string") {
        process.env.STAVE_TEST_ABSOLUTE_PATH = originalAbsolutePath;
      } else {
        delete process.env.STAVE_TEST_ABSOLUTE_PATH;
      }
    }
  });

  test("accepts path-like command overrides after normalizing tilde prefixes", () => {
    if (process.platform === "win32" || !process.env.HOME?.trim()) {
      return;
    }

    const originalCommand = process.env.STAVE_TEST_COMMAND;
    const { executablePath } = createExecutableFixture({
      prefix: ".stave-exec-command-home-",
      underHome: true,
    });
    const homeDirectory = process.env.HOME.trim();
    process.env.STAVE_TEST_COMMAND = `~/${path.relative(homeDirectory, executablePath)}`;

    try {
      const resolved = resolveExecutablePath({
        absolutePathEnvVar: "STAVE_TEST_ABSOLUTE_PATH",
        commandEnvVar: "STAVE_TEST_COMMAND",
        defaultCommand: "stave-command-that-does-not-exist",
      });

      expect(resolved).toBe(executablePath);
    } finally {
      if (typeof originalCommand === "string") {
        process.env.STAVE_TEST_COMMAND = originalCommand;
      } else {
        delete process.env.STAVE_TEST_COMMAND;
      }
    }
  });
});

describe("buildExecutableLookupEnv", () => {
  test("prepends extra paths ahead of the base PATH", () => {
    const env = buildExecutableLookupEnv({
      baseEnv: { PATH: "/usr/bin:/bin" },
      extraPaths: ["/opt/demo/bin", "/usr/bin"],
      loginShellPath: "/opt/shell/bin:/usr/local/bin",
    });

    const parts = (env.PATH ?? "").split(path.delimiter);
    expect(parts[0]).toBe("/opt/demo/bin");
    expect(parts).toContain("/opt/shell/bin");
    expect(parts.filter((entry) => entry === "/usr/bin")).toHaveLength(1);
  });
});

describe("toAsarUnpackedPath", () => {
  test("rewrites packaged Electron paths to app.asar.unpacked", () => {
    expect(
      toAsarUnpackedPath(
        "/Applications/Stave.app/Contents/Resources/app.asar/node_modules/@vscode/ripgrep/bin/rg",
      ),
    ).toBe(
      "/Applications/Stave.app/Contents/Resources/app.asar.unpacked/node_modules/@vscode/ripgrep/bin/rg",
    );
  });

  test("leaves non-asar paths unchanged", () => {
    const input = "/Users/demo/node_modules/@vscode/ripgrep/bin/rg";
    expect(toAsarUnpackedPath(input)).toBe(input);
  });
});

describe("normalizeExecutablePathValue", () => {
  test("expands tilde-prefixed paths and rewrites packaged app paths", () => {
    if (process.platform === "win32" || !process.env.HOME?.trim()) {
      return;
    }

    const normalized = normalizeExecutablePathValue({
      value:
        "~/Applications/Stave.app/Contents/Resources/app.asar/node_modules/@vscode/ripgrep/bin/rg",
    });

    expect(normalized).toBe(
      path.join(
        process.env.HOME.trim(),
        "Applications/Stave.app/Contents/Resources/app.asar.unpacked/node_modules/@vscode/ripgrep/bin/rg",
      ),
    );
  });

  test("extracts a path from zsh alias output", () => {
    expect(
      normalizeExecutablePathValue({
        value: "claude: aliased to /tmp/claude",
      }),
    ).toBe("/tmp/claude");
  });

  test("extracts a path from alias declaration output", () => {
    expect(
      normalizeExecutablePathValue({
        value: "alias claude=/tmp/claude",
      }),
    ).toBe("/tmp/claude");
  });

  test("skips warning lines and keeps the first executable candidate", () => {
    expect(
      normalizeExecutablePathValue({
        value: "WARNING: stale shell cache\nclaude is /tmp/claude",
      }),
    ).toBe("/tmp/claude");
  });
});

describe("parseMarkedProbeOutput", () => {
  test("ignores traced stderr command text and reads the actual marked stdout payload", () => {
    const marker = "__STAVE_LOGIN_SHELL_PATH__";
    const stdout = `${marker}/opt/homebrew/bin:/usr/bin:/bin${marker}`;
    const tracedStderr = `+ printf '${marker}%s${marker}' "$PATH"`;

    expect(
      parseMarkedProbeOutput({
        stdout,
        stderr: tracedStderr,
        marker,
      }),
    ).toBe("/opt/homebrew/bin:/usr/bin:/bin");
  });
});

test.each([
  ["sync", resolveLoginShellEnvVarValues],
  ["async", resolveLoginShellEnvVarValuesAsync],
] as const)(
  "a timed-out %s login-shell env probe does not cache a miss",
  async (_mode, resolveValues) => {
    if (process.platform === "win32") return;
    const { executablePath } = createExecutableFixture({
      prefix: "stave-shell-timeout-",
    });
    writeFileSync(
      executablePath,
      "#!/bin/sh\nsleep 1\nprintf '__STAVE_LOGIN_SHELL_ENV__STAVE_PROBE_TEST__/relocated/config__STAVE_LOGIN_SHELL_ENV__STAVE_PROBE_TEST__'\n",
    );
    const originalShell = process.env.SHELL;
    __resetExecutablePathCachesForTests();
    try {
      process.env.SHELL = executablePath;
      __setLoginShellProbeTimeoutMsForTests(50);
      expect(
        await resolveValues({ keys: ["STAVE_PROBE_TEST"] }),
      ).toEqual({ STAVE_PROBE_TEST: null });
      __setLoginShellProbeTimeoutMsForTests(2_000);
      expect(
        await resolveValues({ keys: ["STAVE_PROBE_TEST"] }),
      ).toEqual({ STAVE_PROBE_TEST: "/relocated/config" });
    } finally {
      if (originalShell === undefined) delete process.env.SHELL;
      else process.env.SHELL = originalShell;
      __resetExecutablePathCachesForTests();
    }
  },
);

/**
 * A login shell that sources a profile the test edits, standing in for a user
 * exporting a variable in their shell profile while Stave keeps running. HOME
 * and ZDOTDIR point at the fixture so the fallback system shells never read
 * the developer's real dotfiles.
 */
function withProfileShell(run: (profilePath: string) => Promise<void>) {
  const { executablePath, directory } = createExecutableFixture({
    prefix: "stave-profile-shell-",
  });
  const profilePath = path.join(directory, "profile");
  writeFileSync(profilePath, "", "utf8");
  writeFileSync(
    executablePath,
    `#!/bin/sh\n. '${profilePath}'\nexec /bin/sh -c "$2"\n`,
  );
  const original = {
    SHELL: process.env.SHELL,
    HOME: process.env.HOME,
    ZDOTDIR: process.env.ZDOTDIR,
  };
  __resetExecutablePathCachesForTests();
  process.env.SHELL = executablePath;
  process.env.HOME = directory;
  process.env.ZDOTDIR = directory;
  return run(profilePath).finally(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    __resetExecutablePathCachesForTests();
  });
}

test("refreshing re-probes a login-shell value cached as unset", async () => {
  if (process.platform === "win32") return;
  await withProfileShell(async (profilePath) => {
    const keys = ["STAVE_FIXTURE_MCP_TOKEN"];
    expect(resolveLoginShellEnvVarValues({ keys })).toEqual({
      STAVE_FIXTURE_MCP_TOKEN: null,
    });

    writeFileSync(profilePath, "export STAVE_FIXTURE_MCP_TOKEN=atl_test\n");
    // The miss stays cached for the app's lifetime until something refreshes it.
    expect(resolveLoginShellEnvVarValues({ keys })).toEqual({
      STAVE_FIXTURE_MCP_TOKEN: null,
    });

    expect(await refreshLoginShellEnvVarValues({ keys })).toEqual(keys);
    expect(resolveLoginShellEnvVarValues({ keys })).toEqual({
      STAVE_FIXTURE_MCP_TOKEN: "atl_test",
    });
    // Nothing changed since the last refresh.
    expect(await refreshLoginShellEnvVarValues({ keys })).toEqual([]);
  });
});

test("a refresh that times out keeps the cached login-shell value", async () => {
  if (process.platform === "win32") return;
  await withProfileShell(async (profilePath) => {
    const keys = ["STAVE_FIXTURE_MCP_TOKEN"];
    writeFileSync(profilePath, "export STAVE_FIXTURE_MCP_TOKEN=atl_old\n");
    expect(resolveLoginShellEnvVarValues({ keys })).toEqual({
      STAVE_FIXTURE_MCP_TOKEN: "atl_old",
    });

    writeFileSync(
      profilePath,
      "sleep 1\nexport STAVE_FIXTURE_MCP_TOKEN=atl_new\n",
    );
    __setLoginShellProbeTimeoutMsForTests(50);
    expect(await refreshLoginShellEnvVarValues({ keys })).toEqual([]);
    expect(resolveLoginShellEnvVarValues({ keys })).toEqual({
      STAVE_FIXTURE_MCP_TOKEN: "atl_old",
    });
  });
});

async function waitForFile(filePath: string) {
  for (let attempt = 0; attempt < 500 && !existsSync(filePath); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("a probe that started earlier never overwrites a newer refreshed value", async () => {
  if (process.platform === "win32") return;
  await withProfileShell(async (profilePath) => {
    const directory = path.dirname(profilePath);
    const valuePath = path.join(directory, "value");
    const delayPath = path.join(directory, "delay");
    const readPath = path.join(directory, "read");
    // The shell reads the value and delay first and announces it, then waits, so an
    // earlier probe can hold an old value while a later one finishes first.
    writeFileSync(
      profilePath,
      `STAVE_VALUE="$(cat '${valuePath}')"\nSTAVE_DELAY="$(cat '${delayPath}')"\necho read >> '${readPath}'\nsleep "$STAVE_DELAY"\nexport STAVE_FIXTURE_MCP_TOKEN="$STAVE_VALUE"\n`,
    );
    writeFileSync(valuePath, "atl_old");
    writeFileSync(delayPath, "1");
    const keys = ["STAVE_FIXTURE_MCP_TOKEN"];
    const earlier = resolveLoginShellEnvVarValuesAsync({ keys });
    await waitForFile(readPath);

    writeFileSync(valuePath, "atl_new");
    writeFileSync(delayPath, "0");
    expect(await refreshLoginShellEnvVarValues({ keys })).toEqual(keys);
    // The earlier probe finishes last with the old value; the cache keeps the
    // newer one and the earlier caller gets it too.
    expect(await earlier).toEqual({ STAVE_FIXTURE_MCP_TOKEN: "atl_new" });
    expect(resolveLoginShellEnvVarValues({ keys })).toEqual({
      STAVE_FIXTURE_MCP_TOKEN: "atl_new",
    });
  });
});

test("an earlier lookup's fallback shells never overwrite a newer refreshed value", async () => {
  if (process.platform === "win32") return;
  await withProfileShell(async (profilePath) => {
    const directory = path.dirname(profilePath);
    const valuePath = path.join(directory, "value");
    const delayPath = path.join(directory, "delay");
    const readPath = path.join(directory, "read");
    // The first shell finds nothing and is slow, so the earlier lookup moves on
    // to the fallback system shells after a later refresh stored the value.
    writeFileSync(
      profilePath,
      `STAVE_VALUE="$(cat '${valuePath}')"\nSTAVE_DELAY="$(cat '${delayPath}')"\necho read >> '${readPath}'\nsleep "$STAVE_DELAY"\n[ -n "$STAVE_VALUE" ] && export STAVE_FIXTURE_MCP_TOKEN="$STAVE_VALUE"\n`,
    );
    writeFileSync(valuePath, "");
    writeFileSync(delayPath, "1");
    const keys = ["STAVE_FIXTURE_MCP_TOKEN"];
    const earlier = resolveLoginShellEnvVarValuesAsync({ keys });
    await waitForFile(readPath);

    writeFileSync(valuePath, "atl_new");
    writeFileSync(delayPath, "0");
    expect(await refreshLoginShellEnvVarValues({ keys })).toEqual(keys);
    // The earlier lookup's fallbacks miss the variable; the newer value stays.
    expect(await earlier).toEqual({ STAVE_FIXTURE_MCP_TOKEN: "atl_new" });
    expect(resolveLoginShellEnvVarValues({ keys })).toEqual({
      STAVE_FIXTURE_MCP_TOKEN: "atl_new",
    });
  });
});

test("identical concurrent refreshes share one follow-up probe", async () => {
  if (process.platform === "win32") return;
  await withProfileShell(async (profilePath) => {
    const probesPath = path.join(path.dirname(profilePath), "probes");
    writeFileSync(
      profilePath,
      `echo probe >> '${probesPath}'\nexport STAVE_FIXTURE_MCP_TOKEN=atl_test\n`,
    );
    const keys = ["STAVE_FIXTURE_MCP_TOKEN"];
    const results = await Promise.all([
      refreshLoginShellEnvVarValues({ keys }),
      refreshLoginShellEnvVarValues({ keys }),
      refreshLoginShellEnvVarValues({ keys }),
    ]);
    // One probe runs; the two that arrived while it ran share the next one.
    expect(readFileSync(probesPath, "utf8").trim().split("\n")).toHaveLength(2);
    expect(results).toEqual([keys, [], []]);
    // A refresh after they settle probes again.
    expect(await refreshLoginShellEnvVarValues({ keys })).toEqual([]);
    expect(readFileSync(probesPath, "utf8").trim().split("\n")).toHaveLength(3);
  });
});
