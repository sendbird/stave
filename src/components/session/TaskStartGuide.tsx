import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";
import { sx } from "../ads/utils/stylex";
import { MessageSquareIcon } from "lucide-react";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui";
import { ActionButton } from "@/components/system/ActionButton";
import { getWorkspaceInstructions } from "@/lib/workspace-resume-brief";
import { useAppStore } from "@/store/app.store";

const STARTING_POINTS = [
  {
    title: "Understand or decide",
    description: "Explore code, investigate a problem, or compare options.",
    example:
      "Explain how this project works, identify the risks, and recommend a next step. Cite the files or sources behind your conclusions.",
  },
  {
    title: "Build or fix",
    description: "Turn a concrete goal into a change you can review.",
    example:
      "Help me change this behavior. First inspect the relevant code, then implement the change and run the appropriate checks. Explain anything you could not verify.",
  },
  {
    title: "Research or write",
    description: "Create a report, plan, or document using your work context.",
    example:
      "Use the attached context to prepare a decision document. Include the recommendation, supporting evidence, open questions, and next actions.",
  },
] as const;

/** Orientation for an empty task; no setup wizard or runtime changes required. */
export function TaskStartGuide({
  onSelect,
}: {
  onSelect?: (prompt: string) => void;
}) {
  const brief = useAppStore((state) => state.workspaceInformation.resumeBrief);
  const showExamples = useAppStore(
    (state) => state.settings.showTaskStartExamples,
  );
  const openInformation = () =>
    useAppStore.getState().setLayout({
      patch: { sidebarOverlayVisible: true, sidebarOverlayTab: "information" },
    });
  const hasInstructions = Boolean(getWorkspaceInstructions(brief).trim());
  return (
    <div className={sx(styles.shell)} data-testid="task-start-guide">
      <Empty xstyle={styles.root}>
        <EmptyHeader xstyle={styles.introduction}>
          <EmptyMedia variant="icon">
            <MessageSquareIcon />
          </EmptyMedia>
          <EmptyTitle role="heading" aria-level={2}>
            What would you like to work on?
          </EmptyTitle>
          <EmptyDescription>
            Describe the outcome you want, or choose a starting point.
          </EmptyDescription>
        </EmptyHeader>
        {showExamples ? (
          <div className={sx(styles.content)}>
            <div className={sx(styles.startingPoints)}>
              {STARTING_POINTS.map((item) => (
                <div key={item.title} className={sx(styles.startingPoint)}>
                  <div className={sx(styles.promptText)}>
                    <h3 className={sx(styles.promptTitle)}>{item.title}</h3>
                    <p className={sx(styles.promptDescription)}>
                      {item.description}
                    </p>
                  </div>
                  {onSelect ? (
                    <ActionButton
                      weight="quiet"
                      size="sm"
                      xstyle={styles.promptAction}
                      onClick={() => onSelect(item.example)}
                      aria-label={`Use prompt: ${item.title}`}
                    >
                      Use prompt
                    </ActionButton>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Empty>
      {showExamples ? (
        <div className={sx(styles.actions, styles.footerActions)}>
          <Button variant="outline" onClick={openInformation}>
            {hasInstructions
              ? "Review shared instructions"
              : "Add shared instructions"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  shell: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: vars.space8,
    inlineSize: "100%",
    minInlineSize: 0,
  },
  root: { gap: vars.space16, padding: vars.space20 },
  introduction: {
    // Cross-axis centering now lives in the `EmptyHeader` shim, so every empty
    // state gets it rather than the surfaces that noticed the medallion drift.
    // ADS constrains the header with `maxInlineSize`, so override that same
    // logical property rather than racing `maxWidth` against it.
    maxInlineSize: "32rem",
  },
  content: {
    // Logical only: the ADS `EmptyState` content slot constrains itself with
    // `maxInlineSize`, so overriding `maxWidth` would leave two rules racing
    // for the same box.
    inlineSize: "100%",
    maxInlineSize: "32rem",
    minInlineSize: 0,
    display: "flex",
    flexDirection: "column",
    gap: vars.space16,
    textAlign: "left",
  },
  actions: { display: "flex", flexWrap: "wrap", gap: vars.space8 },
  footerActions: {
    inlineSize: "100%",
    maxInlineSize: "32rem",
    justifyContent: "center",
  },
  startingPoints: { minInlineSize: 0 },
  /**
   * The row wraps instead of squeezing the action: below roughly a 24rem
   * content box the copy claims the full inline size and "Use prompt" stacks
   * underneath at full width, so the label is never clipped to "Use pro…".
   */
  startingPoint: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: vars.space16,
    rowGap: vars.space8,
    paddingBlock: vars.space12,
    borderBlockStartWidth: {
      default: vars.borderWidthHairline,
      ":first-child": 0,
    },
    borderBlockStartStyle: "solid",
    borderBlockStartColor: vars.colorBorder,
  },
  /**
   * Title and description are a pair, so the gap between them is the layout's
   * (`space4` on the ADS spacing ramp) rather than a margin hung off the
   * description — the same flex-column-plus-gap shape every other title and
   * description pair in the app uses.
   */
  promptText: {
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    flexBasis: "16rem",
    gap: vars.space4,
    minInlineSize: 0,
  },
  /** Never shrink below the label: the action wraps to its own line first. */
  promptAction: { flexShrink: 0 },
  promptTitle: {
    margin: 0,
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    fontWeight: vars.fontWeightMedium,
  },
  promptDescription: {
    margin: 0,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightRelaxed,
    color: vars.colorTextMuted,
  },
});
