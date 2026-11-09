import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { describe, expect, test } from "bun:test";

import { Approval } from "@/components/aui/components/Approval";
import { Checkpoint } from "@/components/aui/components/Checkpoint";
import { Plan } from "@/components/aui/components/Plan";
import { ToolRun } from "@/components/aui/components/ToolRun";
import { agentMotion } from "@/components/aui/recipes/agent-motion";
import { sx } from "@/components/aui/utils/stylex";
import { TranscriptEntranceScope } from "@/components/session/transcript-entrance-scope";

/*
 * The AUI motion recipes share their duration/easing atoms, so each entrance
 * is identified by the one class its keyframe name compiles to.
 */
const tokens = (value: string) => value.split(/\s+/).filter(Boolean);
function keyframeClass(style: Parameters<typeof sx>[0], ...others: Parameters<typeof sx>[0][]) {
  const shared = new Set(others.flatMap((other) => tokens(sx(other))));
  const unique = tokens(sx(style)).filter((token) => !shared.has(token));
  expect(unique.length).toBeGreaterThan(0);
  return unique;
}
const ENTER = keyframeClass(agentMotion.enter, agentMotion.enterCard, agentMotion.textIn);
const ENTER_CARD = keyframeClass(agentMotion.enterCard, agentMotion.enter, agentMotion.textIn);
const ROLL_IN = keyframeClass(agentMotion.textIn, agentMotion.enter, agentMotion.enterCard);

const classesOf = (markup: string) => new Set(Array.from(markup.matchAll(/class="([^"]*)"/g)).flatMap((match) => tokens(match[1] ?? "")));
const has = (markup: string, keyframe: string[]) => keyframe.every((token) => classesOf(markup).has(token));
const sweepMarkup = sx(agentMotion.highlight);

function transcriptSurfaces(): ReactElement {
  return (
    <>
      <ToolRun status="completed" title="Read file" tool="fs.read" />
      <ToolRun status="completed" title="Read file" tool="fs.read" output="ok" variant="well" />
      {/* Bodies that mount already open (a running MCP App result is defaultOpen). */}
      <ToolRun status="running" title="Open row" tool="app.render" output="body" defaultOpen />
      <ToolRun status="running" title="Open well" tool="app.render" output="body" variant="well" defaultOpen />
      <ToolRun.Group runs={[{ status: "completed" }, { status: "running" }]}>
        <ToolRun key="a" status="completed" title="Search" tool="rg" />
        <ToolRun key="b" status="running" title="Edit" tool="apply_patch" />
      </ToolRun.Group>
      <Plan
        steps={[
          { id: "a", title: "Inspect", status: "done", appliedNote: "use the staging DB" },
          { id: "n", kind: "note", title: "Skip the flaky test", noteStatus: "Queued for step 2" },
          { id: "b", title: "Fix", status: "running" },
          { id: "c", title: "Ship", status: "approval" },
        ]}
      />
      <Checkpoint title="Saved" />
      <Approval title="Run migration" onDecide={() => {}} scopes={[{ value: "once", label: "Once" }]} />
    </>
  );
}

describe("transcript entrance suppression", () => {
  test("outside the transcript, agent surfaces keep the upstream entrance motion", () => {
    const markup = renderToStaticMarkup(transcriptSurfaces());
    expect(has(markup, ENTER)).toBe(true);
    expect(has(markup, ENTER_CARD)).toBe(true);
    // A step mounted current is highlighted; the approval word fades in.
    expect(markup).toContain(`class="${sweepMarkup}"`);
    expect(has(markup, ROLL_IN)).toBe(true);
  });

  test("inside the transcript scope, a mount (a scroll or a history load) plays no entrance", () => {
    const markup = renderToStaticMarkup(<TranscriptEntranceScope>{transcriptSurfaces()}</TranscriptEntranceScope>);
    // Rows, wells, group items, plan steps/notes, applied notes and checkpoints.
    expect(has(markup, ENTER)).toBe(false);
    // The scoped approval card.
    expect(has(markup, ENTER_CARD)).toBe(false);
    // Mount-played state cues wait for a real status change.
    expect(markup).not.toContain(`class="${sweepMarkup}"`);
    expect(has(markup, ROLL_IN)).toBe(false);
    // Content is unchanged: only the motion is withheld.
    expect(markup).toContain("Read file");
    expect(markup).toContain("Open row");
    expect(markup).toContain("Open well");
    expect(markup).toContain('data-plan-step-kind="note"');
    expect(markup).toContain("data-plan-applied-note");
    expect(markup).toContain("Run migration");
  });

  test("the chat transcript and the surfaces that replay it opt in to the scope", () => {
    for (const file of [
      "src/components/session/ChatPanel.tsx",
      "src/components/session/RunTurnDialog.tsx",
      "src/components/session/TaskTurnPlan.tsx",
      "src/components/session/composer-shelf/ShelfPlan.tsx",
    ]) {
      expect(readFileSync(file, "utf8")).toContain("<TranscriptEntranceScope>");
    }
  });
});
