import { describe, expect, test } from "bun:test";
import { LensDiagnosticsStateRevision } from "@/lib/lens/lens-diagnostics-state";

describe("Lens diagnostics state ordering", () => {
  test("rejects a response superseded by a live state event", async () => {
    const revision = new LensDiagnosticsStateRevision();
    const requestRevision = revision.supersede();
    let resolveResponse: (() => void) | undefined;
    const response = new Promise<void>((resolve) => {
      resolveResponse = resolve;
    }).then(() => revision.isCurrent(requestRevision));

    revision.supersede();
    resolveResponse?.();

    expect(await response).toBe(false);
  });

  test("keeps only the latest overlapping request current", () => {
    const revision = new LensDiagnosticsStateRevision();
    const initialRead = revision.supersede();
    const laterMutation = revision.supersede();

    expect(revision.isCurrent(initialRead)).toBe(false);
    expect(revision.isCurrent(laterMutation)).toBe(true);
  });
});
