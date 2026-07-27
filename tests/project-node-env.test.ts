import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildProjectNvmShellConfigOverrides,
  buildProjectShellEnv,
  resolveProjectNvmEnvironment,
} from "../electron/shared/project-node-env";

const createdPaths: string[] = [];

function createFixture(args: {
  nvmrc: string;
  versions: string[];
  nested?: boolean;
}) {
  const root = path.join(
    tmpdir(),
    `stave-project-node-env-${process.pid}-${Date.now()}-${createdPaths.length}`,
  );
  const projectPath = path.join(root, "project");
  const cwd = args.nested
    ? path.join(projectPath, "packages", "app")
    : projectPath;
  const nvmDir = path.join(root, "nvm");
  mkdirSync(cwd, { recursive: true });
  writeFileSync(path.join(projectPath, ".nvmrc"), `${args.nvmrc}\n`);
  for (const version of args.versions) {
    const binPath = path.join(nvmDir, "versions", "node", version, "bin");
    mkdirSync(binPath, { recursive: true });
    const nodePath = path.join(binPath, "node");
    writeFileSync(nodePath, "#!/bin/sh\n");
    chmodSync(nodePath, 0o755);
  }
  createdPaths.push(root);
  return { root, projectPath, cwd, nvmDir };
}

afterEach(() => {
  while (createdPaths.length > 0) {
    rmSync(createdPaths.pop()!, { recursive: true, force: true });
  }
});

describe("project nvm shell environment", () => {
  test("prefers the nearest project's installed .nvmrc version", () => {
    const fixture = createFixture({
      nvmrc: "v20.19.4",
      versions: ["v20.19.4", "v22.22.2"],
      nested: true,
    });
    const staleStaveBin = path.join(
      fixture.nvmDir,
      "versions",
      "node",
      "v22.22.2",
      "bin",
    );

    const env = buildProjectShellEnv({
      cwd: fixture.cwd,
      baseEnv: {
        HOME: fixture.root,
        NVM_DIR: fixture.nvmDir,
        NVM_BIN: staleStaveBin,
        PATH: `${staleStaveBin}${path.delimiter}/usr/bin`,
      },
    });
    const projectBin = path.join(
      fixture.nvmDir,
      "versions",
      "node",
      "v20.19.4",
      "bin",
    );

    expect(env.PATH?.split(path.delimiter)[0]).toBe(projectBin);
    expect(env.NVM_BIN).toBe(projectBin);
    expect(env.NVM_INC).toBe(
      path.join(
        fixture.nvmDir,
        "versions",
        "node",
        "v20.19.4",
        "include",
        "node",
      ),
    );
  });

  test("selects the newest installed version matching a partial specifier", () => {
    const fixture = createFixture({
      nvmrc: "20",
      versions: ["v20.18.1", "v20.19.4", "v22.22.2"],
    });

    expect(
      resolveProjectNvmEnvironment({
        cwd: fixture.cwd,
        baseEnv: { HOME: fixture.root, NVM_DIR: fixture.nvmDir },
      })?.version,
    ).toBe("v20.19.4");
  });

  test("keeps the inherited environment when .nvmrc is unavailable in nvm", () => {
    const fixture = createFixture({
      nvmrc: "v18.20.0",
      versions: ["v22.22.2"],
    });
    const baseEnv = {
      HOME: fixture.root,
      NVM_DIR: fixture.nvmDir,
      PATH: "/stave/node/bin:/usr/bin",
    };

    expect(buildProjectShellEnv({ cwd: fixture.cwd, baseEnv })).toEqual(
      baseEnv,
    );
  });

  test("builds Codex shell policy overrides from the project version", () => {
    const fixture = createFixture({
      nvmrc: "v20.19.4",
      versions: ["v20.19.4"],
    });
    const overrides = buildProjectNvmShellConfigOverrides({
      cwd: fixture.cwd,
      baseEnv: {
        HOME: fixture.root,
        NVM_DIR: fixture.nvmDir,
        PATH: "/usr/bin",
      },
    });

    expect(overrides["shell_environment_policy.set.PATH"]).toStartWith(
      path.join(fixture.nvmDir, "versions", "node", "v20.19.4", "bin"),
    );
    expect(overrides["shell_environment_policy.set.NVM_BIN"]).toBeTruthy();
  });
});
