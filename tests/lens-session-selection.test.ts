import { describe, expect, test } from "bun:test";
import {
  findLensProjectKeyForWorkspace,
  selectPreferredLensSession,
} from "@/lib/lens/lens-session-selection";

interface Candidate {
  lensSessionId: string;
  managedByMcp: boolean;
  visible: boolean;
  lastVisibleAt: number;
}

function candidate(
  lensSessionId: string,
  patch: Partial<Candidate> = {},
): Candidate {
  return {
    lensSessionId,
    managedByMcp: true,
    visible: false,
    lastVisibleAt: 0,
    ...patch,
  };
}

describe("Lens session selection", () => {
  test("uses an explicit session id without falling back", () => {
    const sessions = [
      candidate("default"),
      candidate("panel", {
        managedByMcp: false,
        visible: true,
        lastVisibleAt: 3,
      }),
    ];

    expect(selectPreferredLensSession(sessions, "default")?.lensSessionId).toBe(
      "default",
    );
    expect(selectPreferredLensSession(sessions, "missing")).toBeUndefined();
  });

  test("prefers the most recently visible UI session", () => {
    const sessions = [
      candidate("default"),
      candidate("older-panel", {
        managedByMcp: false,
        visible: true,
        lastVisibleAt: 2,
      }),
      candidate("newer-panel", {
        managedByMcp: false,
        visible: true,
        lastVisibleAt: 7,
      }),
    ];

    expect(selectPreferredLensSession(sessions)?.lensSessionId).toBe(
      "newer-panel",
    );
  });

  test("prefers an existing UI tab before the hidden MCP default", () => {
    const sessions = [
      candidate("default"),
      candidate("panel", {
        managedByMcp: false,
        lastVisibleAt: 4,
      }),
    ];

    expect(selectPreferredLensSession(sessions)?.lensSessionId).toBe("panel");
  });

  test("falls back to the default session before another hidden MCP session", () => {
    const sessions = [candidate("other"), candidate("default")];

    expect(selectPreferredLensSession(sessions)?.lensSessionId).toBe("default");
  });
});

describe("Lens project profile lookup", () => {
  test("finds the owning project path for a workspace", () => {
    expect(
      findLensProjectKeyForWorkspace(
        [
          {
            projectPath: "/projects/one",
            workspaces: [{ id: "ws-one" }],
          },
          {
            projectPath: "/projects/two",
            workspaces: [{ id: "ws-two" }],
          },
        ],
        "ws-two",
      ),
    ).toBe("/projects/two");
  });
});
