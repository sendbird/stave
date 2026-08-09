import { describe, expect, test } from "bun:test";

import {
  createEmptyWorkspaceInformation,
  type WorkspaceHirondelleProjectLink,
} from "../src/lib/workspace-information";
import {
  buildWorkspaceInformationSeed,
  type KickoffProposalDraft,
} from "../src/lib/workspace-kickoff";

const PROJECT_LINK: WorkspaceHirondelleProjectLink = {
  ref: "project-1",
  slug: "checkout-v2",
  name: "Checkout v2",
  url: "https://atelier.example.com/apps/hirondelle/projects/checkout-v2",
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

describe("workspace Hirondelle project information", () => {
  test("starts with no linked Hirondelle project", () => {
    expect(createEmptyWorkspaceInformation().hirondelleProject).toBeNull();
  });

  test("copies an optional kickoff project link into the information seed", () => {
    expect(
      buildWorkspaceInformationSeed(
        createDraft({ hirondelleProject: PROJECT_LINK }),
      ).hirondelleProject,
    ).toEqual(PROJECT_LINK);
    expect(
      buildWorkspaceInformationSeed(createDraft()).hirondelleProject,
    ).toBeNull();
  });
});
