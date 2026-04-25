import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildExecutableLookupEnv,
  normalizeExecutablePathValue,
  parseMarkedProbeOutput,
  resolveExecutablePath,
  toAsarUnpackedPath,
} from "../electron/providers/executable-path";

const tempDirs: string[] = [];

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
        "/Applications/Stave.app/Contents/Resources/app.asar/node_modules/@openai/codex/vendor/bin/codex",
      ),
    ).toBe(
      "/Applications/Stave.app/Contents/Resources/app.asar.unpacked/node_modules/@openai/codex/vendor/bin/codex",
    );
  });

  test("leaves non-asar paths unchanged", () => {
    const input =
      "/Users/demo/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/codex/codex";
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
        "~/Applications/Stave.app/Contents/Resources/app.asar/node_modules/@openai/codex/vendor/bin/codex",
    });

    expect(normalized).toBe(
      path.join(
        process.env.HOME.trim(),
        "Applications/Stave.app/Contents/Resources/app.asar.unpacked/node_modules/@openai/codex/vendor/bin/codex",
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
