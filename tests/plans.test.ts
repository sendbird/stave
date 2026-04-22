import { describe, expect, test } from "bun:test";
import {
  buildWorkspacePlanListEntries,
  buildWorkspacePlanFilePath,
  isWorkspacePlanFilePath,
  MAX_WORKSPACE_PLANS,
  parseWorkspacePlanFilePath,
  resolveWorkspacePlanPersistenceText,
  sortWorkspacePlansNewestFirst,
} from "@/lib/plans";
import { hasMeaningfulPlanText, normalizePlanText } from "@/lib/plan-text";

describe("workspace plans helpers", () => {
  test("writes new plans into the workspace context plans directory", () => {
    const filePath = buildWorkspacePlanFilePath({
      taskId: "12345678-aaaa-bbbb-cccc-1234567890ab",
      createdAt: new Date("2026-04-01T01:02:03.000Z"),
    });

    expect(filePath).toBe(".stave/context/plans/12345678_2026-04-01T01-02-03.md");
  });

  test("recognizes both current and legacy plan file paths", () => {
    expect(isWorkspacePlanFilePath(".stave/context/plans/abcd1234_2026-04-01T01-02-03.md")).toBe(true);
    expect(isWorkspacePlanFilePath(".stave/plans/abcd1234_2026-04-01T01-02-03.md")).toBe(true);
    expect(isWorkspacePlanFilePath(".stave/context/notes.md")).toBe(false);
  });

  test("parses and sorts plan entries newest-first", () => {
    const older = parseWorkspacePlanFilePath(".stave/plans/abcd1234_2026-03-30T01-02-03.md");
    const newer = parseWorkspacePlanFilePath(".stave/context/plans/abcd1234_2026-04-01T04-05-06.md");

    expect(sortWorkspacePlansNewestFirst([older, newer]).map((entry) => entry.filePath)).toEqual([
      newer.filePath,
      older.filePath,
    ]);
    expect(newer.label).toBe("2026-04-01 04:05:06");
  });

  test("builds a newest-first workspace plan list and caps it to the latest five entries", () => {
    const entries = buildWorkspacePlanListEntries({
      currentFilePaths: [
        ".stave/context/plans/task0001_2026-04-01T01-00-00.md",
        ".stave/context/plans/task0002_2026-04-02T01-00-00.md",
        ".stave/context/plans/task0003_2026-04-03T01-00-00.md",
        ".stave/context/plans/task0004_2026-04-04T01-00-00.md",
      ],
      legacyFilePaths: [
        ".stave/plans/task0005_2026-04-05T01-00-00.md",
        ".stave/plans/task0006_2026-04-06T01-00-00.md",
      ],
    });

    expect(entries).toHaveLength(MAX_WORKSPACE_PLANS);
    expect(entries[0]?.filePath).toBe(".stave/plans/task0006_2026-04-06T01-00-00.md");
    expect(entries[0]?.source).toBe("legacy");
    expect(entries.at(-1)?.filePath).toBe(".stave/context/plans/task0002_2026-04-02T01-00-00.md");
  });

  test("dedupes exact duplicate plan paths before sorting", () => {
    const entries = buildWorkspacePlanListEntries({
      currentFilePaths: [
        ".stave/context/plans/task0001_2026-04-01T01-00-00.md",
        ".stave/context/plans/task0001_2026-04-01T01-00-00.md",
      ],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.filePath).toBe(".stave/context/plans/task0001_2026-04-01T01-00-00.md");
  });

  test("strips leading commentary before a structured plan block", () => {
    expect(normalizePlanText(
      "I think this approach is safest.\n\n## Plan\n1. Inspect the parser\n2. Patch the write path",
    )).toBe("## Plan\n1. Inspect the parser\n2. Patch the write path");
  });

  test("strips trailing sign-off commentary after a structured plan block", () => {
    expect(normalizePlanText(
      "## Plan\n- Reproduce the issue\n- Save only normalized output\n\nLet me know if you want me to revise it.",
    )).toBe("## Plan\n- Reproduce the issue\n- Save only normalized output");
  });

  test("extracts only the tagged proposed plan content", () => {
    expect(normalizePlanText(
      "Some analysis\n<proposed_plan>\n## Plan\n- Ship the fix\n</proposed_plan>\nIf you'd like, I can refine it further.",
    )).toBe("## Plan\n- Ship the fix");
  });

  test("keeps unstructured multiline plans intact when no structured block exists", () => {
    expect(normalizePlanText(
      "Inspect the current output.\nPatch the persistence layer.\nRun the focused tests.",
    )).toBe("Inspect the current output.\nPatch the persistence layer.\nRun the focused tests.");
  });

  test("does not treat ellipsis-only placeholder text as a meaningful plan", () => {
    expect(hasMeaningfulPlanText("...")).toBe(false);
    expect(hasMeaningfulPlanText("…")).toBe(false);
  });

  test("skips persisting duplicate normalized plan text for the same turn", () => {
    const persisted = resolveWorkspacePlanPersistenceText({
      planText: "...\n\n## Plan\n- Inspect\n- Patch\n\nLet me know if you want changes.",
      lastPersistedPlanText: "## Plan\n- Inspect\n- Patch",
    });

    expect(persisted).toBeNull();
  });

  test("persists a new normalized plan text when the content changed", () => {
    const persisted = resolveWorkspacePlanPersistenceText({
      planText: "## Plan\n- Inspect\n- Patch\n- Verify",
      lastPersistedPlanText: "## Plan\n- Inspect\n- Patch",
    });

    expect(persisted).toBe("## Plan\n- Inspect\n- Patch\n- Verify");
  });
});
