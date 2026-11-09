import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";

import { Checkpoint } from "@/components/aui/components/Checkpoint";
import { Plan } from "@/components/aui/components/Plan";
import { ToolRun } from "@/components/aui/components/ToolRun";
import { planStatusLabel } from "@/components/aui/components/Plan.parts";
import { planStyles } from "@/components/aui/components/Plan.styles";
import { agentStateLabel } from "@/components/aui/components/agent-state";
import { sx } from "@/components/aui/utils/stylex";

describe("AUI #809 opt-in agent variants", () => {
  test("ToolRun keeps the row by default and draws the well only on request", () => {
    const row = renderToStaticMarkup(<ToolRun status="completed" title="Read file" tool="fs.read" output="ok" />);
    expect(row).not.toContain('data-tool-run-variant="well"');

    const well = renderToStaticMarkup(<ToolRun status="failed" title="Read file" tool="fs.read" error="ENOENT" variant="well" defaultOpen />);
    expect(well).toContain('data-tool-run-variant="well"');
    expect(well).toContain('data-variant="well"');
    // The error plate's label comes from the host translation, as on the row.
    expect(well).toContain("Error");
    expect(well).toContain('role="alert"');
  });

  test("Plan note rows are neither counted nor drawn as steps", () => {
    const html = renderToStaticMarkup(
      <Plan
        steps={[
          { id: "a", title: "Inspect", status: "done", appliedNote: "use the staging DB" },
          { id: "n", kind: "note", title: "Skip the flaky test", noteStatus: "Queued for step 2" },
          { id: "b", title: "Fix", status: "running" },
        ]}
      />,
    );
    expect(html).toContain('data-plan-step-kind="note"');
    expect(html).toContain("data-plan-applied-note");
    expect(html).toContain("Applied your note");
    expect(html).toContain("1 / 2");
  });

  test("Plan without the new props renders as before", () => {
    const html = renderToStaticMarkup(<Plan steps={[{ id: "a", title: "Inspect", status: "done" }]} />);
    expect(html).not.toContain("data-plan-step-kind");
    expect(html).not.toContain("data-plan-applied-note");
  });

  test("Plan inset=\"flush\" puts the title and top-level steps on the content edge", () => {
    const flush = sx(planStyles.flush);
    const steps = [{ id: "a", title: "Inspect", status: "done" as const }, { id: "b", title: "Fix", status: "running" as const }];
    const row = renderToStaticMarkup(<Plan steps={steps} />);
    expect(row.split(flush).length - 1).toBe(0);
    // The header and each of the two top-level steps.
    const html = renderToStaticMarkup(<Plan inset="flush" steps={steps} />);
    expect(html.split(flush).length - 1).toBe(3);
  });

  test("Plan steps speak the shared agent-state words (AUI F7)", () => {
    expect(planStatusLabel.done).toBe(agentStateLabel.done);
    expect(planStatusLabel.approval).toBe(agentStateLabel.approval);
    expect(planStatusLabel.running).toBe(agentStateLabel.running);
  });

  test("Checkpoint stays a separator unless the row variant is asked for", () => {
    const separator = renderToStaticMarkup(<Checkpoint onRestore={() => undefined} onBranch={() => undefined} />);
    expect(separator).not.toContain('data-checkpoint-variant="row"');
    expect(separator).not.toContain("Branch from here");

    const row = renderToStaticMarkup(<Checkpoint variant="row" index="#3" selected onRestore={() => undefined} onBranch={() => undefined} />);
    expect(row).toContain('data-checkpoint-variant="row"');
    expect(row).toContain('aria-current="step"');
    expect(row).toContain("Branch from here");
    expect(row).toContain("Restore");

    const noBranch = renderToStaticMarkup(<Checkpoint variant="row" onRestore={() => undefined} />);
    expect(noBranch).not.toContain("Branch from here");
  });
});
