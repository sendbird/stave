import { expect, test } from "bun:test";
import { createWorkspaceWatchIgnore } from "../config/workspace-watch";

test("source changes are watched inside managed worktrees while local metadata stays ignored", () => {
  const root = "/tmp/project/.stave/workspaces/feature";
  const ignored = createWorkspaceWatchIgnore(root);
  expect(ignored(root)).toBe(false);
  expect(ignored(`${root}/src/App.tsx`)).toBe(false);
  expect(ignored(`${root}/.stave/context/plans/plan.md`)).toBe(true);
  expect(ignored(`${root}/.stave`)).toBe(true);
  expect(ignored(`${root}/.stave-fixtures/test.ts`)).toBe(false);
  expect(ignored(`${root}/../another/src/App.tsx`)).toBe(false);
});
