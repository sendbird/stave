import { describe, expect, test } from "bun:test";

import {
  isMartinConnectorPaired,
  isMartinInformationCardAvailable,
} from "../src/lib/martin-sync/visibility";
import {
  createEmptyWorkspaceInformation,
  type WorkspaceMartinProjectLink,
} from "../src/lib/workspace-information";
import {
  buildWorkspaceInformationSeed,
  type KickoffProposalDraft,
} from "../src/lib/workspace-kickoff";

const PROJECT_LINK: WorkspaceMartinProjectLink = {
  ref: "project-1",
  slug: "checkout-v2",
  name: "Checkout v2",
  url: "https://atelier.example.com/apps/martin/projects/checkout-v2",
  linkedAt: "2026-08-09T12:00:00.000Z",
  lastPulledAt: "2026-08-09T12:00:00.000Z",
};

function createDraft(
  overrides: Partial<KickoffProposalDraft> = {},
): KickoffProposalDraft {
  return {
    branchName: "feat/checkout-v2",
    workspaceLabel: "Checkout v2",
    sourceSummary: "Checkout project",
    firstTaskTitle: "Kick off Checkout v2",
    firstTaskPrompt: "Implement the checkout project.",
    panelEntries: [],
    notes: "",
    todos: [],
    degraded: false,
    sourceConfigId: null,
    model: "deterministic",
    ...overrides,
  };
}

describe("workspace Martin project information", () => {
  test("starts with no linked Martin project", () => {
    expect(createEmptyWorkspaceInformation().martinProject).toBeNull();
  });

  test("copies an optional kickoff project link into the information seed", () => {
    expect(
      buildWorkspaceInformationSeed(
        createDraft({ martinProject: PROJECT_LINK }),
      ).martinProject,
    ).toEqual(PROJECT_LINK);
    expect(
      buildWorkspaceInformationSeed(createDraft()).martinProject,
    ).toBeNull();
  });
});

describe("Martin information card visibility", () => {
  test("stays hidden until Martin is enabled, paired, or already linked", () => {
    expect(isMartinInformationCardAvailable({})).toBe(false);
    expect(isMartinInformationCardAvailable({ martinSyncEnabled: false })).toBe(
      false,
    );
    expect(
      isMartinInformationCardAvailable({ martinConnectorPaired: false }),
    ).toBe(false);
    expect(isMartinInformationCardAvailable({ martinProject: null })).toBe(
      false,
    );
  });

  test("appears after Martin sync is enabled", () => {
    expect(isMartinInformationCardAvailable({ martinSyncEnabled: true })).toBe(
      true,
    );
  });

  test("appears after the Atelier connector is paired with Martin", () => {
    expect(isMartinConnectorPaired(null)).toBe(false);
    expect(isMartinConnectorPaired({ paired: true, scopes: ["crane"] })).toBe(
      false,
    );
    expect(isMartinConnectorPaired({ paired: true, scopes: ["martin"] })).toBe(
      true,
    );
    expect(
      isMartinInformationCardAvailable({ martinConnectorPaired: true }),
    ).toBe(true);
  });

  test("keeps a leftover linked project visible after sync is turned off", () => {
    expect(
      isMartinInformationCardAvailable({
        martinSyncEnabled: false,
        martinConnectorPaired: false,
        martinProject: PROJECT_LINK,
      }),
    ).toBe(true);
  });
});
