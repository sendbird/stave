import { describe, expect, test } from "bun:test";
import {
  attachCliSessionAtRendererSize,
  type CliSessionAttachResult,
} from "@/components/layout/cli-session-restore";

function createHost(options?: { resizeOk?: boolean; resizeThrows?: boolean }) {
  const calls: string[] = [];
  // Stands in for the host's headless mirror: it only ever serializes at the
  // width the PTY currently holds.
  let ptyCols = 120;

  return {
    calls,
    getPtyCols: () => ptyCols,
    resizeSession: async (args: { cols: number }) => {
      calls.push(`resize:${args.cols}`);
      if (options?.resizeThrows) {
        throw new Error("pty is gone");
      }
      if (options?.resizeOk === false) {
        return { ok: false };
      }
      ptyCols = args.cols;
      return { ok: true };
    },
    attachSession: async (): Promise<CliSessionAttachResult> => {
      calls.push(`attach:${ptyCols}`);
      return {
        ok: true,
        attachmentId: "attachment-1",
        // Mirrors the host: the snapshot can only ever be the width the PTY
        // is holding at the moment of the attach.
        screenState: `snapshot@${ptyCols}`,
      };
    },
  };
}

const base = {
  sessionId: "session-1",
  cols: 96,
  rows: 30,
  deliveryMode: "push" as const,
};

describe("attachCliSessionAtRendererSize", () => {
  test("resizes an adopted session before the host serializes its screen", async () => {
    const host = createHost();

    const result = await attachCliSessionAtRendererSize({
      ...base,
      adoptsExistingSession: true,
      resizeSession: host.resizeSession,
      attachSession: host.attachSession,
    });

    // Order is the whole invariant: resizing after the attach would leave the
    // already-serialized 120-column snapshot to rewrap in a 96-column viewport.
    expect(host.calls).toEqual(["resize:96", "attach:96"]);
    expect(result.attached.screenState).toBe("snapshot@96");
    expect(result.adoptedRendererSize).toBe(true);
  });

  test("skips the resize for a session this renderer just spawned", async () => {
    const host = createHost();

    const result = await attachCliSessionAtRendererSize({
      ...base,
      adoptsExistingSession: false,
      resizeSession: host.resizeSession,
      attachSession: host.attachSession,
    });

    expect(host.calls).toEqual(["attach:120"]);
    expect(result.adoptedRendererSize).toBe(false);
  });

  test("still attaches when the host rejects the resize", async () => {
    const host = createHost({ resizeOk: false });

    const result = await attachCliSessionAtRendererSize({
      ...base,
      adoptsExistingSession: true,
      resizeSession: host.resizeSession,
      attachSession: host.attachSession,
    });

    expect(result.attached.ok).toBe(true);
    // False so the caller falls back to its own reconciling resize.
    expect(result.adoptedRendererSize).toBe(false);
  });

  test("still attaches when the resize bridge throws", async () => {
    const host = createHost({ resizeThrows: true });

    const result = await attachCliSessionAtRendererSize({
      ...base,
      adoptsExistingSession: true,
      resizeSession: host.resizeSession,
      attachSession: host.attachSession,
    });

    expect(host.calls).toEqual(["resize:96", "attach:120"]);
    expect(result.attached.ok).toBe(true);
    expect(result.adoptedRendererSize).toBe(false);
  });

  test("attaches without a resize bridge at all", async () => {
    const host = createHost();

    const result = await attachCliSessionAtRendererSize({
      ...base,
      adoptsExistingSession: true,
      resizeSession: undefined,
      attachSession: host.attachSession,
    });

    expect(host.calls).toEqual(["attach:120"]);
    expect(result.adoptedRendererSize).toBe(false);
  });
});
