import * as stylex from "@stylexjs/stylex";
import { vars } from "../ads/tokens/tokens.stylex";
import { sx } from "../ads/utils/stylex";
import { MessageSquareIcon } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui";
import { ActionButton } from "@/components/system/ActionButton";
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
  return (
    <Empty xstyle={styles.root} data-testid="task-start-guide">
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
          {brief?.goal || brief?.nextAction ? (
            <section
              aria-label="Saved workspace direction"
              className={sx(styles.direction)}
            >
              <div className={sx(styles.directionHeader)}>
                <h3 className={sx(styles.directionTitle)}>
                  Pick up where you left off
                </h3>
                <time dateTime={brief.updatedAt} className={sx(styles.savedAt)}>
                  Saved {new Date(brief.updatedAt).toLocaleDateString()}
                </time>
              </div>
              {brief.goal ? (
                <p className={sx(styles.goal)}>{brief.goal}</p>
              ) : null}
              {brief.nextAction ? (
                <p className={sx(styles.nextAction)}>
                  <strong>Next action:</strong> {brief.nextAction}
                </p>
              ) : null}
              <div className={sx(styles.actions)}>
                {onSelect && brief.nextAction ? (
                  <ActionButton
                    weight="primary"
                    onClick={() =>
                      onSelect(
                        `Continue the saved workspace direction.\nNext action: ${brief.nextAction}\nCheck the goal, completion conditions and evidence in Information before proceeding. Report changes to the next action when you finish.`,
                      )
                    }
                  >
                    Prepare the next step
                  </ActionButton>
                ) : null}
                <ActionButton weight="quiet" onClick={openInformation}>
                  Review direction &amp; evidence
                </ActionButton>
              </div>
            </section>
          ) : null}
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
                    onClick={() => onSelect(item.example)}
                    aria-label={`Use prompt: ${item.title}`}
                  >
                    Use prompt
                  </ActionButton>
                ) : null}
              </div>
            ))}
          </div>
          <div className={sx(styles.actions)}>
            <ActionButton
              weight="quiet"
              onClick={() => useAppStore.getState().openAutomationCenter()}
            >
              Browse workflows, macros &amp; presets
            </ActionButton>
            {!brief?.goal && !brief?.nextAction ? (
              <ActionButton weight="quiet" onClick={openInformation}>
                Keep a goal &amp; next action
              </ActionButton>
            ) : null}
          </div>
        </div>
      ) : null}
    </Empty>
  );
}

const styles = stylex.create({
  root: { gap: vars.space20, padding: vars.space20 },
  introduction: {
    // The ADS `EmptyState` header is a grid without `justify-items`, so the
    // icon medallion (a fixed 48px box) resolves to `start` and hangs off the
    // left edge while the centered copy stays centered. Restore the
    // cross-axis centering the header used to carry.
    justifyItems: "center",
    // ADS constrains the header with `maxInlineSize`, so override that same
    // logical property rather than racing `maxWidth` against it.
    maxInlineSize: "32rem",
  },
  content: {
    width: "100%",
    maxWidth: "32rem",
    display: "flex",
    flexDirection: "column",
    gap: vars.space20,
    textAlign: "left",
  },
  direction: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space12,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: vars.colorBorder,
    paddingBottom: vars.space12,
  },
  directionHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.space8,
  },
  directionTitle: {
    fontSize: vars.fontSizeBody,
    fontWeight: vars.fontWeightSemibold,
    lineHeight: vars.lineHeightNormal,
  },
  savedAt: {
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightTight,
    color: vars.colorTextMuted,
  },
  goal: {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
  },
  nextAction: {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 3,
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightTight,
    color: vars.colorTextMuted,
  },
  actions: { display: "flex", flexWrap: "wrap", gap: vars.space8 },
  startingPoints: { minWidth: 0 },
  startingPoint: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.space16,
    paddingBlock: vars.space12,
    borderTopWidth: { default: 1, ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: vars.colorBorder,
  },
  promptText: { minWidth: 0 },
  promptTitle: {
    fontSize: vars.fontSizeBody,
    lineHeight: vars.lineHeightNormal,
    fontWeight: vars.fontWeightMedium,
  },
  promptDescription: {
    marginTop: vars.space4,
    fontSize: vars.fontSizeCaption,
    lineHeight: vars.lineHeightRelaxed,
    color: vars.colorTextMuted,
  },
});
