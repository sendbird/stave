import { describe, expect, test } from "bun:test";
import { extractJiraIssueUrlReference } from "@/lib/crane-connector/jira-reference";
import { parsePromptTokenSegments } from "@/lib/prompt-token-chips";
import {
  safeDecodeURIComponent,
  safeEncodeURIComponent,
} from "@/lib/safe-uri-component";
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

  test("keeps malformed escapes raw and still decodes the valid ones", () => {
    expect(safeDecodeURIComponent("100%")).toBe("100%");
    expect(safeDecodeURIComponent("%E0%A4%A")).toBe("%E0%A4%A");
    expect(safeDecodeURIComponent("DFE-12%33/100%")).toBe("DFE-123/100%");
    expect(safeDecodeURIComponent("%ED%95%9C%zz%20x")).toBe("\uD55C%zz x");
    expect(safeDecodeURIComponent("DFE-12%33%2F%FF")).toBe("DFE-123/%FF");
    expect(safeDecodeURIComponent("%ED%95%9C%E0%A4")).toBe("\uD55C%E0%A4");
    expect(safeDecodeURIComponent("%80%41%ED%A0%80")).toBe("%80A%ED%A0%80");
  });
});

describe("safeEncodeURIComponent", () => {
  test("matches encodeURIComponent for well-formed text", () => {
    expect(safeEncodeURIComponent("a b/한")).toBe(encodeURIComponent("a b/한"));
  });

  test("replaces lone surrogates instead of throwing", () => {
    expect(() => encodeURIComponent("ABC\uD800")).toThrow(URIError);
    expect(safeEncodeURIComponent("ABC\uD800")).toBe("ABC%EF%BF%BD");
    expect(safeEncodeURIComponent("\uDC00x")).toBe("%EF%BF%BDx");
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

  test("decodes an escaped key digit even when another escape is malformed", () => {
    for (const url of [
      "https://company.atlassian.net/browse/DFE-12%33/100%",
      "https://company.atlassian.net/browse/DFE-12%33%2F%FF",
    ]) {
      expect(extractJiraIssueReference(url)?.issueKey).toBe("DFE-123");
      expect(extractJiraIssueUrlReference(url)?.key).toBe("DFE-123");
      expect(resolveServiceLinkBadge(url)).toMatchObject({ label: "DFE-123" });
    }
  });

  test("renders prompt text containing a malformed link without throwing", () => {
    expect(() =>
      parsePromptTokenSegments(
        "check https://crane.example.com/apps/crane/w/TFE/task/CRN-42/100% now",
      ),
    ).not.toThrow();
  });

  test("keeps a malformed @info item id as raw text", () => {
    const reference =
      resolveWorkspaceInformationReferenceFromToken("@info:jira/ABC%");
    expect(reference?.itemId).toBe("ABC%");
    expect(reference?.token).toBe("@info:jira/ABC%25");
  });

  test("builds an @info token for an item id with a lone surrogate", () => {
    expect(() =>
      resolveWorkspaceInformationReferenceFromToken("@info:jira/ABC\uD800"),
    ).not.toThrow();
    expect(
      parsePromptTokenSegments("see @info:jira/ABC\uD800 here").length,
    ).toBeGreaterThan(0);
  });
});
