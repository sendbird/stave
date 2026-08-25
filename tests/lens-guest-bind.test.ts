import { describe, expect, test } from "bun:test";
import {
  decideLensGuestBind,
  type LensGuestBindCandidate,
} from "../electron/main/browser/browser-guest-bind";

const HOST_ID = 1;
const GUEST_ID = 42;

function candidate(
  overrides: Partial<LensGuestBindCandidate> = {},
): LensGuestBindCandidate {
  return {
    type: "webview",
    hostWebContentsId: HOST_ID,
    isExpectedPartition: true,
    isDestroyed: false,
    ...overrides,
  };
}

function decide(args: {
  candidate?: Partial<LensGuestBindCandidate>;
  candidateWebContentsId?: number;
  incumbent?: { webContentsId: number; isDestroyed: boolean } | null;
}) {
  return decideLensGuestBind({
    candidate: candidate(args.candidate),
    candidateWebContentsId: args.candidateWebContentsId ?? GUEST_ID,
    hostWebContentsId: HOST_ID,
    incumbent: args.incumbent ?? null,
  });
}

describe("Lens guest bind", () => {
  test("accepts a live webview guest embedded by the host in the right partition", () => {
    expect(decide({})).toEqual({ ok: true, replacesIncumbent: false });
  });

  test("refuses a WebContents that is not a webview guest", () => {
    // The renderer nominates the id, so "window" and "browserView" are exactly
    // what a compromised renderer would reach for: binding the app's own page
    // would hand page-level CDP and navigation control to the Lens toolchain.
    for (const type of ["window", "browserView", "remote", "backgroundPage"]) {
      const decision = decide({ candidate: { type } });
      expect(decision.ok).toBe(false);
      expect(decision.ok === false && decision.reason).toContain(type);
    }
  });

  test("refuses a guest embedded by a different WebContents", () => {
    const decision = decide({ candidate: { hostWebContentsId: 99 } });
    expect(decision).toEqual({
      ok: false,
      reason:
        "webContents 42 is embedded by 99, not by the Lens host window",
    });
  });

  test("refuses a guest that is not embedded at all", () => {
    const decision = decide({ candidate: { hostWebContentsId: null } });
    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toContain(
      "embedded by nothing",
    );
  });

  test("refuses a guest running in another partition", () => {
    // Several Lens sessions share one partition, so the partition alone cannot
    // say which session a guest belongs to — but it can say which sessions it
    // definitely does not belong to, and that is the half worth enforcing.
    const decision = decide({ candidate: { isExpectedPartition: false } });
    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toContain("partition");
  });

  test("refuses a guest that died before the bind arrived", () => {
    const decision = decide({ candidate: { isDestroyed: true } });
    expect(decision).toEqual({
      ok: false,
      reason: "the nominated guest is already destroyed",
    });
  });

  test("treats a rebind of the current guest as a no-op success", () => {
    const decision = decide({
      incumbent: { webContentsId: GUEST_ID, isDestroyed: false },
    });
    expect(decision).toEqual({ ok: true, replacesIncumbent: false });
  });

  test("refuses to repoint a session that still has a live guest", () => {
    const decision = decide({
      incumbent: { webContentsId: 7, isDestroyed: false },
    });
    expect(decision.ok).toBe(false);
    expect(decision.ok === false && decision.reason).toContain(
      "already has a live guest",
    );
  });

  test("allows replacing a guest that has already died", () => {
    // The renderer reloading, or a guest crashing, leaves main holding a dead
    // WebContents. Refusing here would strand the session with no way back.
    const decision = decide({
      incumbent: { webContentsId: 7, isDestroyed: true },
    });
    expect(decision).toEqual({ ok: true, replacesIncumbent: true });
  });

  test("checks identity before incumbency", () => {
    // Order matters: a dead incumbent must not become a door through which a
    // non-webview or foreign-partition WebContents can be bound.
    const decision = decide({
      candidate: { type: "window" },
      incumbent: { webContentsId: 7, isDestroyed: true },
    });
    expect(decision.ok).toBe(false);
  });
});
