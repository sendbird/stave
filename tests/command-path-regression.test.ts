import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildExecutableLookupEnv } from "../electron/providers/executable-path";

const createdPaths: string[] = [];
function createFixtureHome(args: { name: string }) {
  const home = path.join(tmpdir(), args.name);
  const binDir = path.join(home, ".local", "bin");
  mkdirSync(binDir, { recursive: true });
  createdPaths.push(home);
  return { home, binDir };
}

afterEach(() => {
  while (createdPaths.length > 0) {
    const targetPath = createdPaths.pop();
    if (!targetPath) {
      continue;
    }
    rmSync(targetPath, { recursive: true, force: true });
  }
});

describe("command PATH lookup regressions", () => {
  test("buildExecutableLookupEnv adds the HOME-scoped local bin directory ahead of the base PATH", () => {
    if (process.platform === "win32") {
      return;
    }

    const { home, binDir } = createFixtureHome({
      name: `stave-command-path-home-${process.pid}-${Date.now()}`,
    });
    const env = buildExecutableLookupEnv({
      baseEnv: {
        ...process.env,
        HOME: home,
        PATH: "/usr/bin:/bin",
      },
    });
    const parts = (env.PATH ?? "").split(path.delimiter);

    expect(parts).toContain(binDir);
    expect(parts).toContain("/usr/bin");
    expect(parts).toContain("/bin");
  });

  test("buildExecutableLookupEnv keeps the HOME-scoped local bin directory stable across repeated calls", () => {
    if (process.platform === "win32") {
      return;
    }

    const { home, binDir } = createFixtureHome({
      name: `stave-command-shell-home-${process.pid}-${Date.now()}`,
    });
    const baseEnv = {
      ...process.env,
      HOME: home,
      PATH: "/usr/bin:/bin",
    };

    const first = buildExecutableLookupEnv({
      baseEnv,
    });
    const second = buildExecutableLookupEnv({
      baseEnv,
    });

    expect(first.PATH?.split(path.delimiter)).toContain(binDir);
    expect(second.PATH?.split(path.delimiter)).toContain(binDir);
    expect(first.PATH).toBe(second.PATH);
  });

  test("buildExecutableLookupEnv preserves login-shell PATH even when baseEnv is a clone", () => {
    if (process.platform === "win32") {
      return;
    }

    const baseEnv = {
      ...process.env,
      PATH: "/usr/bin:/bin",
    };

    const env = buildExecutableLookupEnv({
      baseEnv,
      loginShellPath: "/opt/nvm/current/bin:/usr/local/bin",
    });

    const parts = env.PATH?.split(path.delimiter) ?? [];
    expect(parts).toContain("/opt/nvm/current/bin");
    expect(parts).toContain("/usr/local/bin");
  });
});
