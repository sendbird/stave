import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceResumeBrief } from "@/components/layout/WorkspaceResumeBrief";
import { emptyResumeBriefFields } from "@/lib/workspace-resume-brief";

test("shared instructions state what they do, when they apply and when they get abridged", () => {
  const empty = renderToStaticMarkup(
    createElement(WorkspaceResumeBrief, { workspaceId: "w", brief: null }),
  );
  expect(empty).toContain("Standing rules for this workspace");
  expect(empty).toContain("Nothing shared yet");
  expect(empty).toContain("Add instructions");

  const long = renderToStaticMarkup(
    createElement(WorkspaceResumeBrief, {
      workspaceId: "w",
      brief: {
        ...emptyResumeBriefFields(),
        instructions: "x".repeat(1500),
        updatedAt: "2026-09-05T10:00:00.000Z",
        sourceTaskId: null,
      },
    }),
  );
  expect(long).toContain("Active in every task");
  expect(long).toContain("Edit instructions");
  expect(long).toContain("first 1,400 characters verbatim");
});
