import { expect, test } from "bun:test";
import { parseWorkspaceSnapshot } from "@/lib/task-context/schemas";
import {
  buildCurrentTaskAwarenessRetrievedContextParts,
  STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
} from "@/lib/task-context/current-task-awareness";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import {
  emptyResumeBriefFields,
  getWorkspaceInstructions,
  WorkspaceResumeBriefSchema,
} from "@/lib/workspace-resume-brief";

const brief = {
  ...emptyResumeBriefFields(),
  goal: "Preserve the full product scope across tasks",
  completionCriteria: "Recovery and usability must both pass",
  decisions: "Retain advanced controls",
  evidence: ".stave/context/plans/readiness.md",
  nextAction: "Measure workspace switching",
  updatedAt: "2026-09-05T10:00:00.000Z",
  sourceTaskId: "task-1",
};

test("workspace snapshots retain maintained direction when the turn recap is replaced", () => {
  const information = {
    ...createEmptyWorkspaceInformation(),
    resumeBrief: brief,
    intentAnchorIds: ["resource-1"],
    martinProject: {
      ref: "ref",
      slug: "project",
      name: "Project",
      url: "https://example.com/project",
      linkedAt: brief.updatedAt,
      lastPulledAt: null,
      stale: true,
    },
  };
  const snapshot = parseWorkspaceSnapshot({
    payload: {
      activeTaskId: "",
      tasks: [],
      messagesByTask: {},
      workspaceInformation: information,
    },
  });
  expect(snapshot?.workspaceInformation?.resumeBrief).toEqual(brief);
  expect(snapshot?.workspaceInformation?.intentAnchorIds).toEqual(
    information.intentAnchorIds,
  );
  expect(snapshot?.workspaceInformation?.martinProject).toEqual(
    information.martinProject,
  );
  const resumed = parseWorkspaceSnapshot({
    payload: {
      ...snapshot,
      workspaceInformation: {
        ...snapshot?.workspaceInformation,
        turnSummary: {
          turnId: "next-turn",
          taskId: "task-2",
          taskTitle: "One small fix",
          generatedAt: brief.updatedAt,
          model: "summary",
          requestSummary: "Fix a button",
          workSummary: "Fixed it",
        },
      },
    },
  });
  expect(resumed?.workspaceInformation?.resumeBrief).toEqual(brief);
  expect(
    WorkspaceResumeBriefSchema.safeParse({ ...brief, updatedAt: "invalid" })
      .success,
  ).toBe(false);
});

test("shared instructions precede notes and identify abridged context", () => {
  const parts = buildCurrentTaskAwarenessRetrievedContextParts({
    workspaceId: "ws",
    taskId: "task",
    tasks: [],
    workspaceInformation: {
      ...createEmptyWorkspaceInformation(),
      notes: "Old notes ".repeat(1000),
      resumeBrief: {
        ...brief,
        instructions: "Shared constraint ".repeat(200),
      },
    },
  });
  const content = parts.find(
    (part) => part.sourceId === STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
  )!.content;
  expect(content).toContain("Shared constraint");
  expect(content).toContain("[abridged]");
  expect(content.indexOf("Shared constraint")).toBeLessThan(
    content.indexOf("Old notes"),
  );
  expect(content).toContain("do not replace these instructions");
});

test("legacy fields convert without loss and an explicitly cleared instruction stays empty", () => {
  const text = getWorkspaceInstructions(brief);
  for (const value of [
    brief.goal,
    brief.completionCriteria,
    brief.decisions,
    brief.evidence,
    brief.nextAction,
  ]) {
    expect(text).toContain(value);
  }
  expect(getWorkspaceInstructions({ ...brief, instructions: "" })).toBe("");
  const updated = { ...brief, instructions: text };
  expect(WorkspaceResumeBriefSchema.parse(updated)).toEqual(updated);
  expect(
    WorkspaceResumeBriefSchema.safeParse({
      ...updated,
      instructions: "x".repeat(12001),
    }).success,
  ).toBe(false);
});
