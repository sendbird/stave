import { describe, expect, test } from "bun:test";
import { createEmptyWorkspaceInformation } from "@/lib/workspace-information";
import {
  CORE_WORKSPACE_INFORMATION_SECTIONS,
  normalizeWorkspaceInformationSectionVisibility,
  parseWorkspaceInformationOpenSections,
  resolveVisibleWorkspaceInformationSections,
  workspaceInformationSectionHasContent,
} from "@/lib/workspace-information-sections";

describe("workspace information section visibility", () => {
  test("opens only Summary until the user asks for more detail", () => {
    expect(parseWorkspaceInformationOpenSections(null)).toEqual(["overview"]);
    expect(parseWorkspaceInformationOpenSections("not-json")).toEqual([
      "overview",
    ]);
    expect(
      parseWorkspaceInformationOpenSections(
        JSON.stringify(["overview", "plans", "unknown"]),
      ),
    ).toEqual(["overview", "plans"]);
  });

  test("normalizes only known boolean entries", () => {
    expect(
      normalizeWorkspaceInformationSectionVisibility({
        jira: true,
        slack: false,
        unknown: true,
        figma: "yes",
      }),
    ).toEqual({ jira: true, slack: false });
    expect(normalizeWorkspaceInformationSectionVisibility(null)).toEqual({});
  });

  test("shows core sections for an empty workspace", () => {
    expect(
      resolveVisibleWorkspaceInformationSections({
        visibility: {},
        information: createEmptyWorkspaceInformation(),
      }),
    ).toEqual([...CORE_WORKSPACE_INFORMATION_SECTIONS]);
  });

  test("auto-reveals an optional section when it has content", () => {
    const information = createEmptyWorkspaceInformation();
    information.jiraIssues.push({
      id: "jira-1",
      issueKey: "STAVE-123",
      title: "Kickoff",
      url: "https://example.atlassian.net/browse/STAVE-123",
      status: "Open",
      note: "",
    });

    expect(
      workspaceInformationSectionHasContent({ id: "jira", information }),
    ).toBe(true);
    expect(
      resolveVisibleWorkspaceInformationSections({
        visibility: {},
        information,
      }),
    ).toContain("jira");
  });

  test("explicit visibility wins over defaults and content", () => {
    const information = createEmptyWorkspaceInformation();
    information.slackThreads.push({
      id: "slack-1",
      url: "https://example.slack.com/archives/C123/p1",
      channelName: "project",
      note: "",
    });

    const visible = resolveVisibleWorkspaceInformationSections({
      visibility: { todo: false, slack: false, figma: true, overview: false },
      information,
    });

    expect(visible).not.toContain("todo");
    expect(visible).not.toContain("slack");
    expect(visible).toContain("figma");
    expect(visible).toContain("overview");
  });
});
