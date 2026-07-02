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

  test("does not parse generic slash commands in path-like mid-sentence positions", () => {
    const segments = parsePromptTokenSegments("Open /tmp/example", {
      allowGenericCommandTokens: true,
    });

    expect(segments).toEqual([{ type: "text", text: "Open /tmp/example" }]);
  });
});
