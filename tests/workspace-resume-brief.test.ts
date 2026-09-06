import { expect, test } from "bun:test";
import { parseWorkspaceSnapshot } from "@/lib/task-context/schemas";
import {
  buildCurrentTaskAwarenessRetrievedContextParts,
  STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
} from "@/lib/task-context/current-task-awareness";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import {
  emptyResumeBriefFields,
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

test("all direction fields precede long notes and identify abridged context", () => {
  const parts = buildCurrentTaskAwarenessRetrievedContextParts({
    workspaceId: "ws",
    taskId: "task",
    tasks: [],
    workspaceInformation: {
      ...createEmptyWorkspaceInformation(),
      notes: "Old notes ".repeat(1000),
      resumeBrief: {
        ...brief,
        completionCriteria: "Required outcome ".repeat(100),
      },
    },
  });
  const content = parts.find(
    (part) => part.sourceId === STAVE_WORKSPACE_INFORMATION_SOURCE_ID,
  )!.content;
  expect(content).toContain(brief.goal);
  expect(content).toContain("[abridged]");
  expect(content).toContain(brief.decisions);
  expect(content).toContain(brief.evidence);
  expect(content).toContain(brief.nextAction);
  expect(content.indexOf(brief.goal)).toBeLessThan(
    content.indexOf("Old notes"),
  );
  expect(content).toContain("does not replace this goal");
});
