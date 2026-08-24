import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScratchApprovalRow } from "@/components/layout/scratch-session/ScratchTranscript";
import type { ApprovalPart } from "@/types/chat";

const editApproval: ApprovalPart = {
  type: "approval",
  toolName: "Edit",
  description: "Rewrite README.md",
  requestId: "req-1",
  state: "approval-requested",
};

describe("ScratchApprovalRow", () => {
  test("shows the tool name and the description", () => {
    const markup = renderToStaticMarkup(
      createElement(ScratchApprovalRow, {
        part: editApproval,
        disabled: false,
        onRespond: () => {},
      }),
    );

    expect(markup).toContain("Edit");
    expect(markup).toContain("Rewrite README.md");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Deny");
    // The Button's base className always carries `disabled:` Tailwind variants,
    // so a bare substring check for "disabled" would always match. Assert the
    // real HTML disabled *attribute* (`disabled=""`) is absent instead.
    expect(markup).not.toContain('disabled=""');
  });

  test("disables both decisions while a response is in flight", () => {
    const markup = renderToStaticMarkup(
      createElement(ScratchApprovalRow, {
        part: { ...editApproval, requestId: "req-2" },
        disabled: true,
        onRespond: () => {},
      }),
    );

    // Two buttons (Approve + Deny), both must carry the real disabled attribute.
    // The leading space distinguishes the standalone `disabled=""` attribute from
    // base-ui's `data-disabled=""` styling hook, which also ends in `disabled=""`.
    expect(markup.match(/ disabled=""/g)?.length).toBe(2);
  });
});
