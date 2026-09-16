import { expect, test } from "bun:test";
import {
  shouldShowResourceWorkspace,
  type ResourceProcess,
} from "@/lib/performance/resource-manager";

const process = (
  workspaceId: string,
  rssBytes: number,
): ResourceProcess => ({
  pid: 1,
  label: "provider",
  rssBytes,
  cpu: null,
  owners: [{ workspaceId, active: true }],
});

test("hides idle workspaces that have no attributed RSS or Lens page", () => {
  expect(
    shouldShowResourceWorkspace({
      workspaceId: "idle",
      activeWorkspaceId: "current",
      processes: [process("current", 80 * 1024 ** 2)],
      lensWorkspaceIds: ["current"],
    }),
  ).toBe(false);
});

test("keeps the current workspace even when it has no footprint yet", () => {
  expect(
    shouldShowResourceWorkspace({
      workspaceId: "current",
      activeWorkspaceId: "current",
      processes: [],
      lensWorkspaceIds: [],
    }),
  ).toBe(true);
});

test("keeps workspaces that still hold RSS or a Lens page", () => {
  expect(
    shouldShowResourceWorkspace({
      workspaceId: "settled",
      activeWorkspaceId: "current",
      processes: [process("settled", 40 * 1024 ** 2)],
      lensWorkspaceIds: [],
    }),
  ).toBe(true);
  expect(
    shouldShowResourceWorkspace({
      workspaceId: "lens-only",
      activeWorkspaceId: "current",
      processes: [],
      lensWorkspaceIds: ["lens-only"],
    }),
  ).toBe(true);
});

test("does not treat a zero-RSS owner as a memory consumer", () => {
  expect(
    shouldShowResourceWorkspace({
      workspaceId: "empty",
      activeWorkspaceId: "current",
      processes: [process("empty", 0)],
      lensWorkspaceIds: [],
    }),
  ).toBe(false);
});
