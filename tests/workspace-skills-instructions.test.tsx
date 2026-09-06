import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SkillDetail,
  SkillInstructionsContent,
  SkillMetadataDetails,
} from "@/components/layout/WorkspaceSkillsPanel";
import { skillStyles } from "@/components/layout/workspace-skills.styles";
import { sx } from "@/components/ads/utils/stylex";
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
    // The rendered surface uses the themed ADS surface + text tokens
    // (formerly `bg-surface` / `text-foreground`), never a hardcoded dark slab
    // (the removed `bg-neutral-950` / `text-neutral-300`). Binding to this style
    // identity is the guarantee; the hashed StyleX class can only be the themed
    // surface.
    expect(html).toContain(sx(skillStyles.instructionsRendered));
    expect(html).not.toContain("<script>");
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
    // 13px reading step, 24px line-height, and a themed (not hardcoded-dark)
    // surface all live on this one source style (formerly `text-[13px]`,
    // `leading-6`, `bg-muted/25`, `text-foreground`, and never the removed
    // `bg-neutral-950` / `text-neutral-300` dark slab).
    expect(html).toContain(sx(skillStyles.instructionsSource));
    expect(html).toContain("## Workflow");
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
    // The chevron rotates open on toggle. StyleX has no `group-open:` parent
    // selector, so the rotate now rides a React-state style (`summaryChevronOpen`,
    // formerly `group-open:rotate-90`). Collapsed markup carries the base chevron
    // style but not the rotated one.
    expect(html).toContain(sx(skillStyles.summaryChevron));
    expect(html).not.toContain(sx(skillStyles.summaryChevronOpen));
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
    // With instructions present, the overview is bounded (max-height 42%) and
    // scrolls with contained overscroll (formerly `max-h-[42%] overflow-y-auto
    // overscroll-contain`), so the instructions pane can fill the rest.
    expect(html).toContain(sx(skillStyles.overviewScrolled));
    expect(html).toContain('data-skill-detail-instructions=""');
    // The instructions pane is the bottom-filling flex column
    // (formerly `min-h-0 flex-1 flex-col`).
    expect(html).toContain(sx(skillStyles.instructionsBlock));
    expect(html).not.toContain("<details open");
    expect(html.indexOf('data-skill-detail-overview=""')).toBeLessThan(
      html.indexOf('data-skill-detail-instructions=""'),
    );
  });
});
