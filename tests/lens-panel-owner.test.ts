import { describe, expect, test } from "bun:test";
import { resolveLensPanelOwnerWorkspaceId } from "../src/lib/lens/lens-panel-owner";

describe("Lens panel owner workspace", () => {
  test("keeps the mount-time workspace when the active one changes", () => {
    expect(
      resolveLensPanelOwnerWorkspaceId({
        ownerWorkspaceId: "ws-alpha",
        activeWorkspaceId: "ws-beta",
      }),
    ).toBe("ws-alpha");
  });

  test("adopts the first active workspace when mounted before one existed", () => {
    expect(
      resolveLensPanelOwnerWorkspaceId({
        ownerWorkspaceId: "",
        activeWorkspaceId: "ws-alpha",
      }),
    ).toBe("ws-alpha");
  });

  test("stays unowned while no workspace is active", () => {
    expect(
      resolveLensPanelOwnerWorkspaceId({
        ownerWorkspaceId: "",
        activeWorkspaceId: "",
      }),
    ).toBe("");
  });
});
