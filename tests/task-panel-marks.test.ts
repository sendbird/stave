import { expect, test } from "bun:test";
import { WORK_STATE } from "@/components/ads/components/state-vocabulary";
import {
  formatTaskTabCount,
  resolveActivityTabMark,
  resolveProgressTabMark,
  resolveResultsTabMark,
  resolveSubagentsTabMark,
} from "@/components/session/task-panel-marks";

test("Activity marks a pending interaction ahead of a running turn", () => {
  expect(resolveActivityTabMark({ running: true, pendingInteraction: "approval" })).toEqual({
    kind: "state",
    state: "approval",
    label: "Approval needed",
  });
  expect(resolveActivityTabMark({ running: true, pendingInteraction: "user_input" })).toEqual({
    kind: "state",
    state: "needs-you",
    label: "Input needed",
  });
  expect(resolveActivityTabMark({ running: true, pendingInteraction: null })).toEqual({
    kind: "state",
    state: "working",
    label: "Running",
  });
  expect(resolveActivityTabMark({ running: false, pendingInteraction: null })).toBeNull();
});

test("running and waiting on the user wear different glyphs, not only different colours", () => {
  // Themes such as vesper and ayu-mirage paint accent and warning the same
  // hue, so the shape is the only cue that survives there.
  const running = resolveActivityTabMark({ running: true, pendingInteraction: null });
  const approval = resolveActivityTabMark({ running: true, pendingInteraction: "approval" });
  const input = resolveActivityTabMark({ running: true, pendingInteraction: "user_input" });
  const glyphs = [running, approval, input].map((mark) =>
    mark?.kind === "state" ? WORK_STATE[mark.state].icon : null,
  );
  expect(new Set(glyphs).size).toBe(3);
});

test("Progress marks only a run that needs attention", () => {
  expect(resolveProgressTabMark(null)).toBeNull();
  expect(resolveProgressTabMark({ tone: "accent", label: "Running" })).toBeNull();
  expect(resolveProgressTabMark({ tone: "warning", label: "Needs sign-off" })).toEqual({
    kind: "state",
    state: "needs-you",
    label: "Needs sign-off",
  });
  expect(resolveProgressTabMark({ tone: "danger", label: "Failed" })).toEqual({
    kind: "state",
    state: "failed",
    label: "Failed",
  });
});

test("Subagents and Results carry counts, and nothing at zero", () => {
  expect(resolveSubagentsTabMark(0)).toBeNull();
  expect(resolveResultsTabMark(0)).toBeNull();
  expect(resolveSubagentsTabMark(2)).toEqual({ kind: "count", count: 2, text: "2", label: "2 running" });
  expect(resolveResultsTabMark(3)).toEqual({ kind: "count", count: 3, text: "3", label: "3 to review" });
});

test("counts read literally to 99", () => {
  expect(formatTaskTabCount(9)).toBe("9");
  expect(formatTaskTabCount(99)).toBe("99");
  expect(formatTaskTabCount(100)).toBe("99+");
});
