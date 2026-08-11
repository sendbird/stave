import { describe, expect, test } from "bun:test";
import { parsePromptTokenSegments } from "@/lib/prompt-token-chips";
import type { CommandPaletteItem } from "@/lib/commands";
import type { SkillCatalogEntry } from "@/lib/skills/types";
import type { WorkspaceInformationReferenceOption } from "@/lib/workspace-information-references";

const command: CommandPaletteItem = {
  id: "provider:/review",
  command: "/review",
  insertText: "/review ",
  description: "Run a review",
  source: "provider_native",
  searchText: "/review review",
};

const skill: SkillCatalogEntry = {
  id: "skill:local:review",
  slug: "review-helper",
  name: "Review helper",
  description: "Review current changes",
  scope: "local",
  provider: "shared",
  path: "/tmp/skills/review-helper/SKILL.md",
  realPath: "/tmp/skills/review-helper/SKILL.md",
  sourceRootPath: "/tmp/skills",
  sourceRootRealPath: "/tmp/skills",
  invocationToken: "$review-helper",
  instructions: "Review current changes.",
};

const informationOption: WorkspaceInformationReferenceOption = {
  reference: {
    section: "todo",
    scope: "section",
    label: "Todos",
    token: "@info:todo",
  },
  title: "Todos",
  description: "Reference all todos.",
  group: "Sections",
  kind: "section",
  searchText: "@info:todo todos reference all todos",
};

describe("parsePromptTokenSegments", () => {
  test("parses slash command, skill, and Information tokens into chip descriptors", () => {
    const segments = parsePromptTokenSegments(
      "Run /review with $review-helper and @info:todo",
      {
        commandPaletteItems: [command],
        skillPaletteItems: [skill],
        workspaceInformationReferenceOptions: [informationOption],
      },
    );

    expect(
      segments
        .filter((segment) => segment.type === "token")
        .map((segment) =>
          segment.type === "token"
            ? {
                kind: segment.descriptor.kind,
                token: segment.descriptor.token,
                label: segment.descriptor.label,
              }
            : null,
        ),
    ).toEqual([
      { kind: "command", token: "/review", label: "/review" },
      { kind: "skill", token: "$review-helper", label: "Review helper" },
      { kind: "information", token: "@info:todo", label: "Todos" },
    ]);
  });

  test("parses @lens into a Lens browser chip descriptor", () => {
    const segments = parsePromptTokenSegments("Inspect @lens and report", {});

    expect(segments).toMatchObject([
      { type: "text", text: "Inspect " },
      {
        type: "token",
        descriptor: {
          kind: "information",
          token: "@lens",
          label: "Lens browser",
        },
      },
      { type: "text", text: " and report" },
    ]);
  });

  test("parses @web into a provider browser chip descriptor", () => {
    const segments = parsePromptTokenSegments("Open this with @web", {});

    expect(segments).toMatchObject([
      { type: "text", text: "Open this with " },
      {
        type: "token",
        descriptor: {
          kind: "information",
          token: "@web",
          label: "Connected browser",
          detail: "Provider browser",
        },
      },
    ]);
  });

  test("does not treat @lens-prefixed words as Lens chips", () => {
    const segments = parsePromptTokenSegments(
      "Check @lenses and @website today",
      {},
    );

    expect(segments).toEqual([
      { type: "text", text: "Check @lenses and @website today" },
    ]);
  });

  test("does not treat incomplete triggers as chips", () => {
    const segments = parsePromptTokenSegments("Try / $ @ @info", {
      commandPaletteItems: [command],
      skillPaletteItems: [skill],
      workspaceInformationReferenceOptions: [informationOption],
    });

    expect(segments).toEqual([{ type: "text", text: "Try / $ @ @info" }]);
  });

  test("supports provider passthrough commands when generic commands are enabled", () => {
    const segments = parsePromptTokenSegments("/unknown-command now", {
      allowGenericCommandTokens: true,
    });

    expect(segments).toMatchObject([
      {
        type: "token",
        descriptor: {
          kind: "command",
          token: "/unknown-command",
          label: "/unknown-command",
        },
      },
      { type: "text", text: " now" },
    ]);
  });

  test("parses recognized service links into badge chip descriptors", () => {
    const segments = parsePromptTokenSegments(
      "See https://company.atlassian.net/browse/DFE-1234 for details",
    );

    expect(segments).toEqual([
      { type: "text", text: "See " },
      {
        type: "token",
        descriptor: {
          kind: "link",
          token: "https://company.atlassian.net/browse/DFE-1234",
          label: "DFE-1234",
          detail: "https://company.atlassian.net/browse/DFE-1234",
          serviceLink: "jira",
        },
      },
      { type: "text", text: " for details" },
    ]);
  });

  test("parses Figma and Confluence links with derived labels", () => {
    const segments = parsePromptTokenSegments(
      "https://www.figma.com/design/AbC123/Chat-Redesign?node-id=1-2 and https://company.atlassian.net/wiki/spaces/ENG/pages/9/Release+Notes",
    );

    expect(
      segments
        .filter((segment) => segment.type === "token")
        .map((segment) =>
          segment.type === "token"
            ? {
                kind: segment.descriptor.kind,
                label: segment.descriptor.label,
                serviceLink: segment.descriptor.serviceLink,
              }
            : null,
        ),
    ).toEqual([
      { kind: "link", label: "Chat Redesign", serviceLink: "figma" },
      { kind: "link", label: "Release Notes", serviceLink: "confluence" },
    ]);
  });

  test("keeps trailing punctuation out of service link chips", () => {
    const segments = parsePromptTokenSegments(
      "(see https://company.atlassian.net/browse/DFE-7).",
    );

    expect(segments).toMatchObject([
      { type: "text", text: "(see " },
      {
        type: "token",
        descriptor: {
          kind: "link",
          token: "https://company.atlassian.net/browse/DFE-7",
          label: "DFE-7",
        },
      },
      { type: "text", text: ")." },
    ]);
  });

  test("leaves unrecognized URLs as plain text", () => {
    const segments = parsePromptTokenSegments(
      "Check https://github.com/org/repo/pull/1 and http://example.com",
    );

    expect(segments).toEqual([
      {
        type: "text",
        text: "Check https://github.com/org/repo/pull/1 and http://example.com",
      },
    ]);
  });

  test("does not tokenize URL-shaped text without a preceding boundary", () => {
    const segments = parsePromptTokenSegments(
      "prefix:https://company.atlassian.net/browse/DFE-1",
    );

    expect(segments).toEqual([
      { type: "text", text: "prefix:https://company.atlassian.net/browse/DFE-1" },
    ]);
  });

  test("does not parse generic slash commands in path-like mid-sentence positions", () => {
    const segments = parsePromptTokenSegments("Open /tmp/example", {
      allowGenericCommandTokens: true,
    });

    expect(segments).toEqual([{ type: "text", text: "Open /tmp/example" }]);
  });
});
