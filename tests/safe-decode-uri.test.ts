import { describe, expect, test } from "bun:test";
import { extractJiraIssueUrlReference } from "@/lib/crane-connector/jira-reference";
import { safeDecodeURIComponent } from "@/lib/safe-decode-uri";
import { resolveServiceLinkBadge } from "@/lib/service-link-badges";
import {
  detectWorkspaceResourcesInText,
  extractConfluencePageReference,
  extractCraneIssueReference,
  extractFigmaResourceReference,
  extractJiraIssueReference,
  extractStorybookResourceReference,
} from "@/lib/workspace-information";
import { resolveWorkspaceInformationReferenceFromToken } from "@/lib/workspace-information-references";

// `new URL()` keeps a stray `%` as-is, so these parse but `decodeURIComponent`
// on their path throws `URIError: URI malformed`.
const MALFORMED_URLS = [
  "https://crane.example.com/apps/crane/w/TFE/task/CRN-42%",
  "https://company.atlassian.net/browse/DFE-1234?q=100%",
  "https://www.figma.com/design/AbCdEf123/Chat%E0%A4%A",
  "https://storybook.example.com/%zz",
  "https://company.atlassian.net/wiki/spaces/ENG/pages/123/Title%",
  "http://localhost:5173/progress/100%",
];

describe("safeDecodeURIComponent", () => {
  test("decodes valid escapes", () => {
    expect(safeDecodeURIComponent("a%20b%2Fc")).toBe("a b/c");
  });

  test("returns the input unchanged on a malformed escape", () => {
    expect(safeDecodeURIComponent("100%")).toBe("100%");
    expect(safeDecodeURIComponent("%E0%A4%A")).toBe("%E0%A4%A");
  });
});

describe("link parsers tolerate malformed percent escapes", () => {
  test.each(MALFORMED_URLS)("does not throw for %s", (url) => {
    expect(() => resolveServiceLinkBadge(url)).not.toThrow();
    expect(() => extractCraneIssueReference(url)).not.toThrow();
    expect(() => extractJiraIssueReference(url)).not.toThrow();
    expect(() => extractJiraIssueUrlReference(url)).not.toThrow();
    expect(() => extractFigmaResourceReference(url)).not.toThrow();
    expect(() => extractStorybookResourceReference(url)).not.toThrow();
    expect(() => extractConfluencePageReference(url)).not.toThrow();
    expect(() =>
      detectWorkspaceResourcesInText(`see ${url} for details`),
    ).not.toThrow();
  });

  test("still resolves a Crane task whose path has a stray percent", () => {
    expect(
      extractCraneIssueReference(
        "https://crane.example.com/apps/crane/w/TFE/task/CRN-42?x=%",
      ),
    ).toMatchObject({ issueKey: "CRN-42", teamKey: "TFE" });
    expect(
      extractCraneIssueReference(
        "https://crane.example.com/apps/crane/w/TFE/task/CRN-42/100%",
      ),
    ).toMatchObject({ issueKey: "CRN-42", teamKey: "TFE" });
  });

  test("still resolves a Jira key next to a malformed query", () => {
    expect(
      extractJiraIssueReference(
        "https://company.atlassian.net/browse/DFE-1234?q=100%",
      )?.issueKey,
    ).toBe("DFE-1234");
    expect(
      extractJiraIssueUrlReference(
        "https://company.atlassian.net/browse/DFE-1234?q=100%",
      )?.key,
    ).toBe("DFE-1234");
  });

  test("keeps a malformed @info item id as raw text", () => {
    expect(() =>
      resolveWorkspaceInformationReferenceFromToken("@info:jira/ABC%"),
    ).not.toThrow();
  });
});
