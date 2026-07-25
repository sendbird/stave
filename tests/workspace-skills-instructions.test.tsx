import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SkillDetail,
  SkillInstructionsContent,
  SkillMetadataDetails,
} from "@/components/layout/WorkspaceSkillsPanel";
import type { SkillCatalogEntry } from "@/lib/skills/types";

const skill: SkillCatalogEntry = {
  id: "skill-example",
  slug: "example",
  name: "Example",
  description: "An example skill.",
  scope: "user",
  provider: "codex",
  path: "/skills/example/SKILL.md",
  realPath: "/skills/example/SKILL.md",
  sourceRootPath: "/skills",
  sourceRootRealPath: "/skills",
  invocationToken: "$example",
  instructions: "Use this skill.",
};

describe("SkillInstructionsContent", () => {
  test("renders skill instructions as safe, theme-aware Markdown", () => {
    const html = renderToStaticMarkup(
      createElement(SkillInstructionsContent, {
        instructions: [
          "## Workflow",
          "",
          "- Inspect the repository",
          "- Run focused tests",
          "",
          "<script>alert('unsafe')</script>",
        ].join("\n"),
      }),
    );

    expect(html).toContain('data-skill-instructions-rendered=""');
    expect(html).toContain("<h2");
    expect(html).toContain("<ul");
    expect(html).toContain("font-size:14px");
    expect(html).toContain("bg-surface");
    expect(html).toContain("text-foreground");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("bg-neutral-950");
    expect(html).not.toContain("text-neutral-300");
  });

  test("keeps source mode readable without a hardcoded dark surface", () => {
    const html = renderToStaticMarkup(
      createElement(SkillInstructionsContent, {
        instructions: "## Workflow\n\nUse `bun test`.",
        presentation: "source",
      }),
    );

    expect(html).toContain('data-skill-instructions-source=""');
    expect(html).toContain("<pre");
    expect(html).toContain("text-[13px]");
    expect(html).toContain("leading-6");
    expect(html).toContain("bg-muted/25");
    expect(html).toContain("text-foreground");
    expect(html).toContain("## Workflow");
    expect(html).not.toContain("bg-neutral-950");
    expect(html).not.toContain("text-neutral-300");
  });
});

describe("SkillMetadataDetails", () => {
  test("keeps secondary metadata collapsed until requested", () => {
    const html = renderToStaticMarkup(
      createElement(SkillMetadataDetails, { skill }),
    );

    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("<dl");
    expect(html).toContain('data-skill-metadata-details=""');
    expect(html).not.toContain("<details open");
    expect(html).toContain("group-open:rotate-90");
  });
});

describe("SkillDetail", () => {
  test("places the prompt insertion action beside the invocation token", () => {
    const html = renderToStaticMarkup(
      createElement(SkillDetail, {
        skill,
        onBack: () => {},
        onUse: () => {},
        onViewInstructions: () => {},
      }),
    );

    const invocationIndex = html.indexOf("Invocation");
    const insertIndex = html.indexOf('aria-label="Insert into prompt"');

    expect(invocationIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(invocationIndex);
    expect(html.slice(0, invocationIndex)).not.toContain(
      'aria-label="Insert into prompt"',
    );
  });

  test("keeps long overview content scrollable above a bottom-filling instructions pane", () => {
    const html = renderToStaticMarkup(
      createElement(SkillDetail, {
        skill: {
          ...skill,
          description: Array.from(
            { length: 24 },
            () => "A deliberately long skill description.",
          ).join(" "),
        },
        onBack: () => {},
        onUse: () => {},
        onViewInstructions: () => {},
      }),
    );

    expect(html).toContain('data-skill-detail-body=""');
    expect(html).toContain('data-skill-detail-overview=""');
    expect(html).toContain("max-h-[42%]");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("overscroll-contain");
    expect(html).toContain('data-skill-detail-instructions=""');
    expect(html).toContain("min-h-0 flex-1 flex-col");
    expect(html).not.toContain("<details open");
    expect(html.indexOf('data-skill-detail-overview=""')).toBeLessThan(
      html.indexOf('data-skill-detail-instructions=""'),
    );
  });
});
