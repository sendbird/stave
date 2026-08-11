import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceInformationConnectedBrowserCard } from "../src/components/layout/WorkspaceInformationConnectedBrowserCard";

describe("WorkspaceInformationConnectedBrowserCard", () => {
  test("shows provider-native browser connection metadata only", () => {
    const html = renderToStaticMarkup(
      <WorkspaceInformationConnectedBrowserCard
        tab={{
          providerId: "claude-code",
          status: "connected",
          requestedAt: "2026-08-11T05:00:00.000Z",
          lastUpdatedAt: "2026-08-11T05:00:01.000Z",
        }}
      />,
    );

    expect(html).toContain("Connected browser tab");
    expect(html).toContain("Claude Code");
    expect(html).toContain("Connected");
    expect(html).toContain("native browser tools");
    expect(html).toContain("site approvals remain provider-owned");
    expect(html).not.toContain("example.com");
  });

  test("renders nothing before a browser connection is requested", () => {
    expect(
      renderToStaticMarkup(
        <WorkspaceInformationConnectedBrowserCard tab={null} />,
      ),
    ).toBe("");
  });
});
