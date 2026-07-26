import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ManagedTaskTakeoverNotice } from "@/components/session/ManagedTaskTakeoverNotice";
import {
  TaskSourceContextNotice,
  resolveManagedTaskComposerAccess,
} from "@/components/session/TaskSourceContextNotice";

describe("ManagedTaskTakeoverNotice", () => {
  test("offers a direct takeover action after the managed run ends", () => {
    const html = renderToStaticMarkup(
      createElement(ManagedTaskTakeoverNotice, {
        owner: "stave",
        isTurnActive: false,
        canTakeOver: true,
        onTakeOver: () => {},
      }),
    );

    expect(html).toContain("Managed by Stave");
    expect(html).toContain("Take Over");
    expect(html).toContain('aria-label="Take over managed task"');
    expect(html).not.toContain(' disabled=""');
  });

  test("keeps takeover visible but disabled while the run is active", () => {
    const html = renderToStaticMarkup(
      createElement(ManagedTaskTakeoverNotice, {
        owner: "external",
        isTurnActive: true,
        canTakeOver: false,
        onTakeOver: () => {},
      }),
    );

    expect(html).toContain("Managed externally");
    expect(html).toContain("unlocks when it stops");
    expect(html).toContain(' disabled=""');
  });

  test("keeps the composer monitor-only until host ownership is released", () => {
    expect(
      resolveManagedTaskComposerAccess({
        managedTaskOwner: "stave",
        isTurnActive: true,
        canSteerActiveTurn: true,
      }),
    ).toEqual({
      disabled: true,
      submitMode: "send",
    });
    expect(
      resolveManagedTaskComposerAccess({
        managedTaskOwner: null,
        isTurnActive: true,
        canSteerActiveTurn: true,
      }),
    ).toEqual({
      disabled: false,
      submitMode: "steer-or-queue",
    });
  });

  test("shows task-scoped Crane context after takeover", () => {
    const html = renderToStaticMarkup(
      createElement(TaskSourceContextNotice, {
        sourceContexts: [
          {
            type: "retrieved_context",
            sourceId: "crane:ATL-1",
            title: "Crane ATL-1 · Fix dispatch",
            content: "Untrusted issue material.",
          },
        ],
      }),
    );

    expect(html).toContain("Crane ATL-1 · Fix dispatch");
    expect(html).toContain("Attached to every turn");
    expect(html).toContain("Untrusted issue material.");
  });
});
