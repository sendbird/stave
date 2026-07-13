import { describe, expect, test } from "bun:test";
import {
  buildCreatePrShipPrompt,
  isCreatePrWorkspaceStateActive,
  resolveCreatePrShipAvailability,
} from "@/components/layout/TopBarOpenPR.utils";
import type { SkillCatalogEntry } from "@/lib/skills/types";

const shipSkill: SkillCatalogEntry = {
  id: "user:shared:ship",
  slug: "ship",
  name: "Ship",
  description: "Publish a completed change as a ready PR.",
  scope: "user",
  provider: "shared",
  path: "/tmp/skills/ship/SKILL.md",
  realPath: "/tmp/skills/ship/SKILL.md",
  sourceRootPath: "/tmp/skills",
  sourceRootRealPath: "/tmp/skills",
  invocationToken: "$ship",
  instructions: "Ship the current change.",
};

describe("resolveCreatePrShipAvailability", () => {
  test("resolves the ship skill only from the active workspace catalog", () => {
    expect(
      resolveCreatePrShipAvailability({
        catalogStatus: "ready",
        catalogWorkspacePath: "/tmp/worktree-a/",
        workspacePath: "/tmp/worktree-a",
        skills: [shipSkill],
        providerId: "codex",
      }),
    ).toEqual({ status: "ready", invocationToken: "$ship" });
  });

  test("waits when the catalog still belongs to another workspace", () => {
    expect(
      resolveCreatePrShipAvailability({
        catalogStatus: "ready",
        catalogWorkspacePath: "/tmp/worktree-a",
        workspacePath: "/tmp/worktree-b",
        skills: [shipSkill],
        providerId: "codex",
      }),
    ).toEqual({ status: "loading" });
  });

  test("reports a missing compatible ship skill", () => {
    expect(
      resolveCreatePrShipAvailability({
        catalogStatus: "ready",
        catalogWorkspacePath: "/tmp/worktree-a",
        workspacePath: "/tmp/worktree-a",
        skills: [{ ...shipSkill, provider: "claude-code" }],
        providerId: "codex",
      }),
    ).toEqual({ status: "missing" });
  });
});

describe("buildCreatePrShipPrompt", () => {
  test("activates ship and makes ready PR plus auto-merge explicit", () => {
    expect(buildCreatePrShipPrompt("$ship")).toBe(
      "$ship Ship the completed change in this workspace as a ready pull request and enable auto-merge.",
    );
  });
});

describe("isCreatePrWorkspaceStateActive", () => {
  test("hides in-flight UI state immediately after switching workspaces", () => {
    expect(
      isCreatePrWorkspaceStateActive({
        activeWorkspaceId: "workspace-b",
        stateWorkspaceId: "workspace-a",
      }),
    ).toBe(false);
    expect(
      isCreatePrWorkspaceStateActive({
        activeWorkspaceId: "workspace-a",
        stateWorkspaceId: "workspace-a",
      }),
    ).toBe(true);
  });
});
