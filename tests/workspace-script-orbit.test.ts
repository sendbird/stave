import { describe, expect, test } from "bun:test";
import {
  buildOrbitDisplayCommand,
  buildOrbitEnv,
  buildOrbitGetArgs,
  DEFAULT_ORBIT_PROXY_PORT,
  ORBIT_URL_MARKER,
  buildOrbitCommand,
  buildPortlessLaunchSpec,
  buildOrbitRunArgs,
  extractOrbitOutput,
  sanitizeOrbitName,
  tokenizeOrbitCommand,
} from "../electron/main/workspace-scripts/orbit";

describe("sanitizeOrbitName", () => {
  test("normalizes arbitrary labels into host-safe names", () => {
    expect(sanitizeOrbitName("Automation UI")).toBe("automation-ui");
    expect(sanitizeOrbitName("...")).toBe("app");
  });
});

describe("buildOrbitCommand", () => {
  test("builds orbit env variables from config", () => {
    expect(
      buildOrbitEnv({
        orbit: {
          noTls: true,
          proxyPort: 1355,
        },
      }),
    ).toEqual({
      PORTLESS_PORT: "1355",
      PORTLESS_HTTPS: "0",
    });
  });

  test("builds direct portless argv for simple commands", () => {
    const orbitArgs = buildOrbitRunArgs({
      commandArgs: ["yarn", "start"],
      defaultName: "stave",
      orbit: {
        name: "Stave Desktop",
        noTls: false,
      },
    });

    expect(orbitArgs).toEqual([
      "run",
      "--name",
      "stave-desktop",
      "yarn",
      "start",
    ]);
    expect(
      buildOrbitGetArgs({
        defaultName: "stave",
        orbit: {
          name: "Stave Desktop",
          noTls: false,
        },
      }),
    ).toEqual(["get", "stave-desktop"]);
    expect(
      buildOrbitDisplayCommand({
        portlessCommand: "/tmp/portless",
        orbitArgs,
      }),
    ).toBe("'/tmp/portless' 'run' '--name' 'stave-desktop' 'yarn' 'start'");
  });

  test("tokenizes simple shell-free commands and rejects shell syntax", () => {
    expect(tokenizeOrbitCommand("yarn start --host 0.0.0.0")).toEqual([
      "yarn",
      "start",
      "--host",
      "0.0.0.0",
    ]);
    expect(tokenizeOrbitCommand("pnpm --filter web dev")).toEqual([
      "pnpm",
      "--filter",
      "web",
      "dev",
    ]);
    expect(tokenizeOrbitCommand("FOO=1 yarn start")).toBeNull();
    expect(tokenizeOrbitCommand("yarn start && echo ready")).toBeNull();
  });

  test("wraps shell commands with portless fallback when direct argv is unavailable", () => {
    const command = buildOrbitCommand({
      command: "bun run dev -- --mode local",
      defaultName: "stave",
      portlessCommand: "/tmp/portless",
      orbit: {
        name: "Stave Desktop",
        noTls: true,
        proxyPort: 1355,
      },
    });

    expect(command).toContain(
      `'/tmp/portless' 'run' '--name' 'stave-desktop' 'sh' '-lc'`,
    );
    expect(command).toContain(ORBIT_URL_MARKER);
    expect(command).toContain('"$PORTLESS_URL"');
    expect(command).toContain("bun run dev -- --mode local");
  });

  test("defaults orbit env to the unprivileged proxy port", () => {
    expect(
      buildOrbitEnv({
        orbit: {
          noTls: false,
        },
      }),
    ).toEqual({
      PORTLESS_PORT: String(DEFAULT_ORBIT_PROXY_PORT),
    });
  });

  test("runs bundled JS portless through the current runtime instead of shebang lookup", () => {
    const spec = buildPortlessLaunchSpec({
      portlessCommand: "/tmp/portless/dist/cli.js",
      orbitArgs: ["run", "--name", "stave-desktop", "yarn", "start"],
    });

    expect(spec.command).toBe(process.execPath);
    expect(spec.args).toEqual([
      "/tmp/portless/dist/cli.js",
      "run",
      "--name",
      "stave-desktop",
      "yarn",
      "start",
    ]);
    expect(spec.env).toEqual({
      ELECTRON_RUN_AS_NODE: "1",
    });
  });
});

describe("extractOrbitOutput", () => {
  test("extracts orbit URL markers and preserves normal output", () => {
    const first = extractOrbitOutput({
      buffer: "",
      chunk: `${ORBIT_URL_MARKER}https://fix-ui.stave.localhost\nready\npart`,
    });
    expect(first.orbitUrls).toEqual(["https://fix-ui.stave.localhost"]);
    expect(first.output).toBe("ready\n");
    expect(first.buffer).toBe("part");

    const second = extractOrbitOutput({
      buffer: first.buffer,
      chunk: "ial\n",
    });
    expect(second.orbitUrls).toEqual([]);
    expect(second.output).toBe("partial\n");
    expect(second.buffer).toBe("");
  });
});
