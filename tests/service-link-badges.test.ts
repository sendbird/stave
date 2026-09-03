import { describe, expect, test } from "bun:test";
import { resolveServiceLinkBadge } from "@/lib/service-link-badges";

describe("resolveServiceLinkBadge", () => {
  test("resolves Figma design links with a humanized title", () => {
    expect(
      resolveServiceLinkBadge(
        "https://www.figma.com/design/AbCdEf123/Chat-Input-Redesign?node-id=12-34",
      ),
    ).toEqual({ kind: "figma", label: "Chat Input Redesign" });
  });

  test("falls back to the service name for Figma links without a title", () => {
    expect(resolveServiceLinkBadge("https://figma.com/file/AbCdEf123")).toEqual(
      { kind: "figma", label: "Figma" },
    );
  });

  test("resolves Jira issue links to the issue key", () => {
    expect(
      resolveServiceLinkBadge("https://company.atlassian.net/browse/DFE-1234"),
    ).toEqual({ kind: "jira", label: "DFE-1234" });
  });

  test("resolves Jira links on jira-branded hosts", () => {
    expect(
      resolveServiceLinkBadge("https://jira.example.com/browse/ABC-42"),
    ).toEqual({ kind: "jira", label: "ABC-42" });
  });

  test("resolves Crane task links to the Crane badge", () => {
    expect(
      resolveServiceLinkBadge(
        "https://tracker.example.com/apps/crane/w/TFE/task/CRN-42",
      ),
    ).toEqual({ kind: "crane", label: "CRN-42" });
  });

  test("keeps a Crane link off the Jira badge even on a Jira-looking host", () => {
    expect(
      resolveServiceLinkBadge(
        "https://jira.example.com/apps/crane/w/TFE/task/CRN-42",
      ),
    ).toEqual({ kind: "crane", label: "CRN-42" });
  });

  test("keeps resolving a genuine Jira link alongside the Crane branch", () => {
    expect(
      resolveServiceLinkBadge("https://company.atlassian.net/browse/CRN-42"),
    ).toEqual({ kind: "jira", label: "CRN-42" });
  });

  test("falls back to the service name for a Crane link without a task key", () => {
    expect(
      resolveServiceLinkBadge("https://tracker.example.com/apps/crane/w/TFE"),
    ).toEqual({ kind: "crane", label: "Crane" });
  });

  test("does not treat issue-key-shaped tokens on arbitrary hosts as Jira", () => {
    expect(
      resolveServiceLinkBadge("https://github.com/org/repo/tree/feat/ABC-42"),
    ).toBeNull();
  });

  test("resolves Confluence page links to the page title", () => {
    expect(
      resolveServiceLinkBadge(
        "https://company.atlassian.net/wiki/spaces/ENG/pages/12345/Release+Checklist",
      ),
    ).toEqual({ kind: "confluence", label: "Release Checklist" });
  });

  test("prefers Confluence over Jira when the page title contains an issue key", () => {
    expect(
      resolveServiceLinkBadge(
        "https://company.atlassian.net/wiki/spaces/ENG/pages/12345/DFE-99+Rollout",
      ),
    ).toEqual({ kind: "confluence", label: "DFE-99 Rollout" });
  });

  test("falls back to the space key for Confluence links without a title", () => {
    expect(
      resolveServiceLinkBadge(
        "https://company.atlassian.net/wiki/spaces/ENG/pages/12345",
      ),
    ).toEqual({ kind: "confluence", label: "ENG" });
  });

  test("returns null for plain external links", () => {
    expect(resolveServiceLinkBadge("https://example.com/docs")).toBeNull();
    expect(
      resolveServiceLinkBadge("https://github.com/org/repo/pull/1"),
    ).toBeNull();
  });

  test("returns null for non-http protocols and invalid input", () => {
    expect(resolveServiceLinkBadge("mailto:someone@figma.com")).toBeNull();
    expect(resolveServiceLinkBadge("not a url")).toBeNull();
    expect(resolveServiceLinkBadge("")).toBeNull();
    expect(resolveServiceLinkBadge(null)).toBeNull();
    expect(resolveServiceLinkBadge(undefined)).toBeNull();
  });
});
