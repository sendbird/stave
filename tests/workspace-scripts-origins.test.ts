import { describe, expect, test } from "bun:test";
import { deriveScriptEntryOrigins } from "../src/lib/workspace-scripts/origins";

const projectConfig = JSON.stringify({
  version: 2,
  actions: { lint: { commands: ["eslint"] } },
  services: { dev: { commands: ["bun run dev"] } },
  targets: { api: { cwd: "project" } },
});

describe("deriveScriptEntryOrigins", () => {
  test("returns null tier and empty maps when no base config parses", () => {
    const origins = deriveScriptEntryOrigins({
      workspaceBase: null,
      workspaceLocal: null,
      projectBase: null,
      projectLocal: null,
    });
    expect(origins).toEqual({
      activeTier: null,
      originByKey: {},
      targetOriginById: {},
    });
  });

  test("attributes entries to the project tier when only the project has a base", () => {
    const origins = deriveScriptEntryOrigins({
      workspaceBase: null,
      workspaceLocal: null,
      projectBase: projectConfig,
      projectLocal: null,
    });

    expect(origins.activeTier).toBe("project");
    expect(origins.originByKey["action:lint"]).toEqual({ tier: "project", localOverride: false });
    expect(origins.originByKey["service:dev"]).toEqual({ tier: "project", localOverride: false });
    expect(origins.targetOriginById.api).toEqual({ tier: "project", localOverride: false });
  });

  test("workspace base wins entirely over project base (first tier with a base)", () => {
    const origins = deriveScriptEntryOrigins({
      workspaceBase: JSON.stringify({
        version: 2,
        actions: { build: { commands: ["bun run build"] } },
      }),
      workspaceLocal: null,
      projectBase: projectConfig,
      projectLocal: null,
    });

    expect(origins.activeTier).toBe("workspace");
    // Only workspace-tier entries are present; the project tier is not consulted.
    expect(origins.originByKey["action:build"]).toEqual({ tier: "workspace", localOverride: false });
    expect(origins.originByKey["action:lint"]).toBeUndefined();
    expect(origins.originByKey["service:dev"]).toBeUndefined();
  });

  test("flags local overrides within the active tier", () => {
    const origins = deriveScriptEntryOrigins({
      workspaceBase: null,
      workspaceLocal: null,
      projectBase: projectConfig,
      projectLocal: JSON.stringify({
        version: 2,
        actions: { lint: { commands: ["eslint --fix"] } },
        services: { extra: { commands: ["echo hi"] } },
      }),
    });

    expect(origins.originByKey["action:lint"]).toEqual({ tier: "project", localOverride: true });
    expect(origins.originByKey["service:dev"]).toEqual({ tier: "project", localOverride: false });
    // Local-only entries surface as overrides of the active tier.
    expect(origins.originByKey["service:extra"]).toEqual({ tier: "project", localOverride: true });
  });

  test("treats unparseable / legacy content as no base", () => {
    const origins = deriveScriptEntryOrigins({
      workspaceBase: "{ not json",
      workspaceLocal: null,
      projectBase: JSON.stringify({ version: 1, run: ["echo legacy"] }),
      projectLocal: null,
    });
    expect(origins.activeTier).toBeNull();
    expect(origins.originByKey).toEqual({});
  });
});
