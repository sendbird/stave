import { Tooltip } from "@/components/aui/components/Tooltip";
import * as stylex from "@stylexjs/stylex";
import { ChevronRight, CircleHelp } from "lucide-react";
import { useId, useRef, useState } from "react";
import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from "@/components/aui/headless/collapsible";
import { transition } from "@/components/aui/recipes/transition";
import { textWrap } from "@/components/aui/recipes/text-wrap";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { useTranslation } from "@/i18n";

const STEPS = [1, 2, 3] as const;
const DETAILS = [3, 4, 5, 6] as const;
const EXAMPLES = [1, 2, 3] as const;

/** Example requests: one press fills the composer (`onExample`); nothing is sent. */
function TarsGuideExamples({ onExample }: { onExample: (text: string) => void }) {
  const { t } = useTranslation(["shell"]);
  const id = useId();
  return <section className={sx(styles.section)} aria-labelledby={`${id}-examples`} data-tars-guide-examples="">
    <h3 id={`${id}-examples`} className={sx(styles.heading)}>{t("shell:tars.guide.examplesTitle")}</h3>
    <ul className={sx(styles.examples)}>
      {EXAMPLES.map((n) => {
        const text = t(`shell:tars.guide.example${n}`);
        return <li key={n} className={sx(styles.exampleItem)}><Button type="button" variant="secondary" size="xs" title={text} onClick={() => onExample(text)}>{t(`shell:tars.guide.exampleLabel${n}`)}</Button></li>;
      })}
    </ul>
  </section>;
}

/** The overview stays short; execution settings are available without crowding it. */
export function TarsGuide({ onExample }: { onExample?: (text: string) => void }) {
  const { t } = useTranslation(["shell"]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  return <div className={sx(styles.root, textWrap.keepAll)} data-tars-guide="">
    <p className={sx(styles.summary)}>{t("shell:tars.guide.summary")}</p>
    <ol className={sx(styles.steps)} aria-label={t("shell:tars.guide.stepsTitle")} data-tars-guide-steps="">
      {STEPS.map((n) => <li key={n}>
        <strong className={sx(styles.stepTitle)}>{t(`shell:tars.guide.step${n}Title`)}</strong>
        <p className={sx(styles.text)}>{t(`shell:tars.guide.step${n}Text`)}</p>
      </li>)}
    </ol>
    {onExample ? <TarsGuideExamples onExample={onExample} /> : null}
    <ul className={sx(styles.list)} data-tars-guide-conditions="">
      <li>{t("shell:tars.guide.limit1")}</li>
      <li>{t("shell:tars.guide.limit2")}</li>
    </ul>
    <CollapsibleRoot open={detailsOpen} onOpenChange={setDetailsOpen}>
      <CollapsibleTrigger render={<Button variant="ghost" size="sm" />} data-tars-guide-details-toggle="">
        <ChevronRight aria-hidden className={sx(styles.chevron, transition.transform, detailsOpen && styles.chevronOpen)} />
        {t("shell:tars.guide.detailsTitle")}
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <ul className={sx(styles.list, styles.details)} data-tars-guide-details="">
          {DETAILS.map((n) => <li key={n}>{t(`shell:tars.guide.limit${n}`)}</li>)}
        </ul>
      </CollapsiblePanel>
    </CollapsibleRoot>
  </div>;
}

/** The header's help button: the same guide in a popover, so it stays reachable once the conversation has history. */
export function TarsGuideButton({ onExample }: { onExample?: (text: string) => void }) {
  const { t } = useTranslation(["shell"]);
  const label: string = t("shell:tars.guide.help");
  const popupRef = useRef<HTMLDivElement>(null);
  return <Popover>
    <PopoverTrigger render={(props) => <Tooltip content={label}><Button {...props} variant="ghost" size="icon-sm" aria-label={label} data-tars-guide-open="" /></Tooltip>}>
      <CircleHelp />
    </PopoverTrigger>
    <PopoverContent ref={popupRef} initialFocus={popupRef} align="end" xstyle={styles.popover} aria-label={label}>
      <TarsGuide onExample={onExample} />
    </PopoverContent>
  </Popover>;
}

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: vars["--aui-space-16"], minWidth: 0, textAlign: "start" },
  summary: { margin: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"] },
  steps: { listStyleType: "decimal", margin: 0, paddingInlineStart: vars["--aui-space-20"], display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"] },
  stepTitle: { color: vars["--aui-color-text"], fontWeight: vars["--aui-font-weight-medium"] },
  text: { margin: 0 },
  details: { marginBlockStart: vars["--aui-space-8"] },
  chevron: { flexShrink: 0 },
  chevronOpen: { transform: "rotate(90deg)" },
  section: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  heading: { margin: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-row"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-control"] },
  list: {
    margin: 0, paddingInlineStart: vars["--aui-space-16"], listStyleType: "disc", display: "flex", flexDirection: "column", gap: vars["--aui-space-4"],
    color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"],
  },
  /** Upstream Suggestions layout (#809 R3): short xs chips in a wrapping row; the full request goes into the composer. */
  examples: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
  exampleItem: { maxWidth: "100%", minWidth: 0 },
  popover: {
    inlineSize: `min(36rem, calc(100dvw - ${vars["--aui-space-32"]}))`,
    maxBlockSize: `min(var(--available-height, 100dvh), calc(100dvh - ${vars["--aui-space-64"]}))`,
    overflowY: "auto",
  },
});
