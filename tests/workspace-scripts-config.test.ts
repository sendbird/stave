import { describe, expect, test } from "bun:test";
import {
  createDefaultScriptTargets,
  getScriptEntry,
  getScriptHooksForTrigger,
  hasAnyScripts,
  mergeScriptsConfig,
  resolveScriptConfigFromTiers,
  resolveScriptsFromConfig,
} from "../src/lib/workspace-scripts/config";
import type {
  WorkspaceScriptsConfig,
  WorkspaceScriptsLocalConfig,
} from "../src/lib/workspace-scripts/types";

describe("mergeScriptsConfig", () => {
  test("returns null when both base and local are null", () => {
    expect(mergeScriptsConfig(null, null)).toBeNull();
  });

  test("merges action and service overrides by id", () => {
    const base: WorkspaceScriptsConfig = {
      version: 2,
      actions: {
        bootstrap: {
          label: "Bootstrap",
          commands: ["bun install"],
          target: "workspace",
        },
      },
      services: {
        dev: {
          commands: ["bun run dev"],
          target: "project",
        },
      },
    };
    const local: WorkspaceScriptsLocalConfig = {
      version: 2,
      actions: {
        bootstrap: {
          commands: ["pnpm install"],
        },
      },
      services: {
        dev: {
          restartOnRun: false,
        },
      },
    };

    expect(mergeScriptsConfig(base, local)).toEqual({
      version: 2,
      actions: {
        bootstrap: {
          label: "Bootstrap",
          commands: ["pnpm install"],
          target: "workspace",
        },
      },
      services: {
        dev: {
          commands: ["bun run dev"],
          target: "project",
          restartOnRun: false,
        },
      },
      hooks: {},
      targets: {},
    });
  });

  test("merges target env values shallowly", () => {
    const base: WorkspaceScriptsConfig = {
      version: 2,
      targets: {
        project: {
          cwd: "project",
          env: { PORT: "3000" },
        },
      },
    };
    const local: WorkspaceScriptsLocalConfig = {
      version: 2,
      targets: {
        project: {
          env: { DEBUG: "1" },
        },
      },
    };

    expect(mergeScriptsConfig(base, local)?.targets?.project).toEqual({
      cwd: "project",
      env: {
        PORT: "3000",
        DEBUG: "1",
      },
    });
  });
});

describe("resolveScriptsFromConfig", () => {
  test("normalizes actions, services, hooks, and targets", () => {
    const config: WorkspaceScriptsConfig = {
      version: 2,
      targets: {
        ci: {
          label: "CI Runtime",
          cwd: "project",
          env: {
            CI: "1",
          },
        },
      },
      actions: {
        bootstrap: {
          description: "Prepare the workspace.",
          commands: ["bun install", "bun run db:prepare"],
        },
      },
      services: {
        app: {
          commands: ["bun run dev"],
          orbit: {
            enabled: true,
            name: "stave-desktop",
          },
        },
      },
      hooks: {
        "task.created": ["bootstrap"],
        "pr.beforeOpen": [{ ref: "app", kind: "service", blocking: false }],
      },
    };

    const resolved = resolveScriptsFromConfig(config);
    expect(resolved?.actions).toHaveLength(1);
    expect(resolved?.services).toHaveLength(1);
    expect(resolved?.targets.ci).toMatchObject({
      label: "CI Runtime",
      cwd: "project",
      env: {
        CI: "1",
      },
    });
    expect(resolved?.services[0]?.orbit).toEqual({
      name: "stave-desktop",
      noTls: false,
    });
    expect(getScriptHooksForTrigger(resolved ?? null, "task.created")).toEqual([
      {
        trigger: "task.created",
        scriptId: "bootstrap",
        scriptKind: "action",
        blocking: true,
      },
    ]);
    expect(getScriptHooksForTrigger(resolved ?? null, "pr.beforeOpen")).toEqual([
      {
        trigger: "pr.beforeOpen",
        scriptId: "app",
        scriptKind: "service",
        blocking: false,
      },
    ]);
  });

  test("drops disabled or empty entries", () => {
    const resolved = resolveScriptsFromConfig({
      version: 2,
      actions: {
        noop: {
          commands: [],
        },
        disabled: {
          commands: ["echo nope"],
          enabled: false,
        },
      },
    });

    expect(resolved?.actions).toEqual([]);
  });
});

describe("resolveScriptConfigFromTiers", () => {
  test("returns the first tier with a base config", () => {
    const first: WorkspaceScriptsConfig = {
      version: 2,
      actions: {
        one: {
          commands: ["echo first"],
        },
      },
    };
    const second: WorkspaceScriptsConfig = {
      version: 2,
      actions: {
        two: {
          commands: ["echo second"],
        },
      },
    };

    const resolved = resolveScriptConfigFromTiers([
      { base: first, local: null },
      { base: second, local: null },
    ]);

    expect(resolved?.actions.map((action) => action.id)).toEqual(["one"]);
  });

  test("applies local overrides inside the winning tier", () => {
    const base: WorkspaceScriptsConfig = {
      version: 2,
      services: {
        app: {
          commands: ["bun run dev"],
        },
      },
    };
    const local: WorkspaceScriptsLocalConfig = {
      version: 2,
      services: {
        app: {
          target: "project",
        },
      },
    };

    const resolved = resolveScriptConfigFromTiers([{ base, local }]);
    expect(getScriptEntry(resolved ?? null, { scriptId: "app", kind: "service" })).toMatchObject({
      targetId: "project",
      target: {
        cwd: "project",
      },
    });
  });
});

describe("helpers", () => {
  test("default targets include workspace and project", () => {
    expect(Object.keys(createDefaultScriptTargets())).toEqual(["workspace", "project"]);
  });

  test("hasAnyScripts reflects content", () => {
    expect(hasAnyScripts(null)).toBe(false);
    expect(hasAnyScripts(resolveScriptsFromConfig({ version: 2 }))).toBe(false);
    expect(
      hasAnyScripts(
        resolveScriptsFromConfig({
          version: 2,
          actions: {
            bootstrap: {
              commands: ["bun install"],
            },
          },
        }),
      ),
    ).toBe(true);
  });
});
