import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";

import { Approval } from "@/components/aui/components/Approval";
import { Badge } from "@/components/aui/components/Badge";
import { RunMonitor } from "@/components/aui/components/RunMonitor";

describe("AUI #809 run objects", () => {
  test("RunMonitor renders only the controls the runtime supplied, on the 2xs rung, with a state mark in the tag", () => {
    const quiet = renderToStaticMarkup(<RunMonitor status="running" statusLabel="Running" title="Export" />);
    expect(quiet).not.toContain("<button");
    expect(quiet).toContain('data-state="working"');
    expect(quiet).toContain('data-run-status="running"');

    const live = renderToStaticMarkup(
      <RunMonitor status="running" statusLabel="Running" title="Export" onPause={() => {}} onOpenLog={() => {}}
        current={{ label: "Now: Cause", elapsed: "2m" }} progress={{ completed: 1, total: 3 }} />,
    );
    expect(live).toContain("Pause");
    expect(live).toContain("Log");
    expect(live).toContain('data-size="2xs"');
    expect(live).toContain("2 / 3");
    expect(live).toContain("Step 2 of 3");
  });

  test("labelled segments draw one list item per stage and hide a readout set to false", () => {
    const html = renderToStaticMarkup(
      <RunMonitor status="interrupted" workState="paused" statusLabel="Paused" title="Export"
        progress={{ completed: 1, total: 3, label: false, stripLabel: "Stages of Export",
          segments: [{ state: "done", label: "Plan: done" }, { state: "stopped", label: "Fix: stopped" }, { state: "pending", label: "Verify: not started" }] }}
        current={{ label: "Now: Fix" }} />,
    );
    expect(html).toContain('data-run-segments="done,stopped,pending"');
    expect((html.match(/<li[ >]/g) ?? []).length).toBe(3);
    expect(html).toContain('aria-label="Stages of Export"');
    expect(html).not.toContain("2 / 3");
    // A settled current step draws its state, never a spinner.
    expect(html).toContain('data-state="paused"');
  });

  test("variant=\"recap\" renders the returned run with the host's state word and states a review only when the caller knows it", () => {
    const unknown = renderToStaticMarkup(
      <RunMonitor variant="recap" status="completed" statusLabel="Handed back" title="Docs" summary="Opened #12"
        actions={<button type="button">Open</button>} />,
    );
    // The recap keeps the removed RunRecap's theme target and DOM.
    expect(unknown).toContain("aui-run-recap");
    expect(unknown).not.toContain("aui-run-monitor");
    expect(unknown).toContain('data-run-status="completed"');
    expect(unknown).not.toContain("data-run-review");
    expect(unknown).toContain("Handed back");
    expect(unknown).not.toContain(">Done<");
    expect(unknown).toContain('data-state="ready"');
    expect(unknown).toContain("Opened #12");
    expect(unknown).toContain(">Open</button>");
    expect(unknown).not.toContain("reviewed");
    // No card parts leak into a recap.
    expect(unknown).not.toContain("<ol");

    const known = renderToStaticMarkup(
      <RunMonitor variant="recap" status="completed" statusLabel="Done" title="Docs" review="unreviewed" returned="1h ago" />,
    );
    expect(known).toContain('data-run-review="unreviewed"');
    expect(known.replace(/<[^>]+>/g, "")).toContain("1h ago · not yet reviewed");
    const reviewed = renderToStaticMarkup(
      <RunMonitor variant="recap" status="completed" statusLabel="Done" title="Docs" review="reviewed" />,
    );
    expect(reviewed).toContain('data-run-review="reviewed"');
    expect(reviewed.replace(/<[^>]+>/g, "")).toContain("reviewed");
  });

  test("the motion layer renders the settled state on first paint: one copy of each swapping label, glyphs in place", () => {
    // Label swaps and glyph swaps only add an exit copy after a change, and
    // reduced motion drops that copy; the first render is the settled tree.
    const html = renderToStaticMarkup(
      <RunMonitor status="running" statusLabel="Running" title="Export" current={{ label: "Now: Cause" }}
        steps={[{ id: "a", label: "Read", status: "done" }, { id: "b", label: "Write", status: "running" }, { id: "c", label: "Lint", status: "failed" }]} />,
    );
    const text = html.replace(/<[^>]+>/g, "|");
    expect(text.split("Now: Cause").length - 1).toBe(1);
    // The title's hidden ", Running" plus the tag's word; no leaving copy.
    expect(text.split("Running").length - 1).toBe(2);
    expect((html.match(/<li[ >]/g) ?? []).length).toBe(3);
    expect(html).not.toMatch(/key="out-/);
  });

  test("Approval with scopes renders the scoped request; without them the transcript decision is unchanged", () => {
    const transcript = renderToStaticMarkup(<Approval title="Run migration" onDecide={() => {}} />);
    expect(transcript).not.toContain('data-layout="scoped"');
    expect(transcript).toContain("Allow once");
    const scoped = renderToStaticMarkup(
      <Approval title="Run migration" onDecide={() => {}} scopes={[{ value: "once", label: "Once" }, { value: "hour", label: "For 1 hour" }]} />,
    );
    expect(scoped).toContain('data-layout="scoped"');
    expect(scoped).toContain(">Allow<");
    expect(scoped).toContain('aria-label="Scope"');
    // Deny is the bordered weight, spelled `outlined` since #811 (2026-11-08).
    expect(scoped).toContain('data-variant="outlined"');
    expect(scoped).not.toContain('data-variant="outline"');
  });

  test("Badge is one pill shape: the #809 tag shape is gone (F1)", () => {
    const md = renderToStaticMarkup(<Badge>Running</Badge>);
    const outlined = renderToStaticMarkup(<Badge variant="outlined">Running</Badge>);
    expect(md).toContain('data-variant="soft"');
    expect(outlined).toContain('data-variant="outlined"');
  });
});
