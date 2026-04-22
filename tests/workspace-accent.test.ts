import { describe, expect, test } from "bun:test";
import { getWorkspaceAccentTone } from "../src/components/layout/workspace-accent";

describe("workspace accent tones", () => {
  test("uses neutral gray tones for the default workspace", () => {
    const tone = getWorkspaceAccentTone({
      workspaceName: "Default Workspace",
      isDefault: true,
    });

    expect(tone.background).toContain("var(--muted)");
    expect(tone.foreground).toContain("var(--muted-foreground)");
    expect(tone.border).toContain("var(--muted-foreground)");
  });

  test("hashes named workspaces into deterministic blue tones", () => {
    const first = getWorkspaceAccentTone({ workspaceName: "feature/api-cleanup" });
    const second = getWorkspaceAccentTone({ workspaceName: "feature/api-cleanup" });

    expect(first).toEqual(second);
    expect(first.background).toContain("oklch(");
    expect(first.background).not.toContain("var(--muted)");
  });
});
