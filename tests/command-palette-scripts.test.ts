import { describe, expect, test } from "bun:test";
import { buildScriptsCommandPaletteActions } from "../src/components/layout/command-palette-scripts";
import {
  EMPTY_SNAPSHOT,
  type ScriptsRuntimeSnapshot,
} from "../src/lib/workspace-scripts/runtime-store";
import type {
  ResolvedScriptTarget,
  ResolvedWorkspaceScript,
} from "../src/lib/workspace-scripts/types";

const target: ResolvedScriptTarget = {
  id: "workspace",
  label: "Workspace",
  cwd: "workspace",
  env: {},
};

function makeEntry(
  overrides: Partial<ResolvedWorkspaceScript> &
    Pick<ResolvedWorkspaceScript, "id" | "kind">,
): ResolvedWorkspaceScript {
  return {
    label: overrides.label ?? overrides.id,
    description: overrides.description ?? "",
    commands: ["echo hi"],
    targetId: "workspace",
    target,
    source: "script",
    ...overrides,
  };
}

function makeSnapshot(
  overrides: Partial<ScriptsRuntimeSnapshot>,
): ScriptsRuntimeSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    configStatus: "ready",
    ...overrides,
  };
}

describe("buildScriptsCommandPaletteActions", () => {
  test("returns [] with no workspace or no config", () => {
    expect(
      buildScriptsCommandPaletteActions({
        snapshot: EMPTY_SNAPSHOT,
        workspaceId: null,
      }),
    ).toEqual([]);
    expect(
      buildScriptsCommandPaletteActions({
        snapshot: EMPTY_SNAPSHOT,
        workspaceId: "ws-1",
      }),
    ).toEqual([]);
  });

  test("emits Start/Run titles and toggles a running service to Stop", () => {
    const snapshot = makeSnapshot({
      config: {
        actions: [makeEntry({ id: "lint", kind: "action", label: "Lint" })],
        services: [
          makeEntry({ id: "dev", kind: "service", label: "Dev Server" }),
        ],
        hooks: {},
        targets: { workspace: target },
        legacyPhases: { setup: [], run: [], teardown: [] },
      },
      entries: {
        "service:dev": { running: true, log: "" },
      },
      origins: {
        activeTier: "project",
        originByKey: {
          "service:dev": { tier: "project", localOverride: true },
          "action:lint": { tier: "workspace", localOverride: false },
        },
        targetOriginById: {},
      },
    });

    const actions = buildScriptsCommandPaletteActions({
      snapshot,
      workspaceId: "ws-1",
    });
    const byId = new Map(actions.map((action) => [action.id, action]));

    const service = byId.get("scripts.run.service.dev");
    expect(service?.title).toBe("Stop Process: Dev Server");
    expect(service?.group).toBe("scripts");
    expect(service?.source).toBe("dynamic");
    expect(service?.customizable).toBe(false);
    expect(service?.subtitle).toContain("Project · Local");

    const action = byId.get("scripts.run.action.lint");
    expect(action?.title).toBe("Run Command: Lint");
    expect(action?.subtitle).toContain("Workspace");
  });

  test("shows Start for a stopped service", () => {
    const snapshot = makeSnapshot({
      config: {
        actions: [],
        services: [
          makeEntry({ id: "dev", kind: "service", label: "Dev Server" }),
        ],
        hooks: {},
        targets: {},
        legacyPhases: { setup: [], run: [], teardown: [] },
      },
    });
    const actions = buildScriptsCommandPaletteActions({
      snapshot,
      workspaceId: "ws-1",
    });
    expect(actions[0]?.title).toBe("Start Process: Dev Server");
  });

  test("emits hook actions only for triggers with refs", () => {
    const snapshot = makeSnapshot({
      config: {
        actions: [],
        services: [],
        hooks: {
          "turn.completed": [
            {
              trigger: "turn.completed",
              scriptId: "lint",
              scriptKind: "action",
              blocking: true,
            },
          ],
        },
        targets: {},
        legacyPhases: { setup: [], run: [], teardown: [] },
      },
    });
    const actions = buildScriptsCommandPaletteActions({
      snapshot,
      workspaceId: "ws-1",
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]?.id).toBe("scripts.hook.turn.completed");
    expect(actions[0]?.title).toBe("Run Trigger: Turn Completed");
    expect(actions[0]?.subtitle).toContain("1 linked execution");
  });
});
