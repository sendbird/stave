import { describe, expect, test } from "bun:test";
import { worktreeStatusHasMeaningfulChanges } from "@/lib/workspace-archive-status";

describe("worktreeStatusHasMeaningfulChanges", () => {
  test("treats an empty status as no changes", () => {
    expect(worktreeStatusHasMeaningfulChanges("")).toBe(false);
    expect(worktreeStatusHasMeaningfulChanges("\n  \n")).toBe(false);
  });

  test("ignores the self-managed node_modules symlink", () => {
    expect(worktreeStatusHasMeaningfulChanges("?? node_modules")).toBe(false);
    expect(worktreeStatusHasMeaningfulChanges("?? node_modules/")).toBe(false);
    expect(worktreeStatusHasMeaningfulChanges("?? node_modules\n")).toBe(false);
  });

  test("reports real changes alongside the ignored symlink", () => {
    expect(
      worktreeStatusHasMeaningfulChanges("?? node_modules\n M src/app.ts"),
    ).toBe(true);
  });

  test("reports staged, modified, untracked, and renamed entries", () => {
    expect(worktreeStatusHasMeaningfulChanges(" M src/app.ts")).toBe(true);
    expect(worktreeStatusHasMeaningfulChanges("A  src/new.ts")).toBe(true);
    expect(worktreeStatusHasMeaningfulChanges("?? notes.txt")).toBe(true);
    expect(worktreeStatusHasMeaningfulChanges("R  old.ts -> new.ts")).toBe(true);
  });

  test("does not confuse a nested node_modules file with the symlink", () => {
    // A real file *inside* a node_modules dir is a meaningful change.
    expect(
      worktreeStatusHasMeaningfulChanges("?? packages/x/node_modules"),
    ).toBe(true);
  });

  test("handles quoted paths", () => {
    expect(worktreeStatusHasMeaningfulChanges('?? "weird name.txt"')).toBe(true);
  });
});
