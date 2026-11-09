import * as stylex from "@stylexjs/stylex";
import { ChevronDown, CircleHelp } from "lucide-react";
import { useId, useState } from "react";
import { textWrap } from "@/components/aui/recipes/text-wrap";
import { transition } from "@/components/aui/recipes/transition";
import { TarsMark } from "./TarsMark";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { useTranslation } from "@/i18n";

const CAN_DO = [1, 2, 3, 4, 5, 6] as const;
const LIMITS = [1, 2, 3, 4, 5, 6] as const;
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

/** What Tars does and what it will not do, with optional examples: the header's help popover and the welcome's disclosure. */
export function TarsGuide({ onExample }: { onExample?: (text: string) => void }) {
  const { t } = useTranslation(["shell"]);
  const id = useId();
  // Examples lead: the popover focuses its first control on open, so the start of the guide stays in view.
  return <div className={sx(styles.root, textWrap.keepAll)} data-tars-guide="">
    {onExample ? <TarsGuideExamples onExample={onExample} /> : null}
    <div className={sx(styles.columns)}>
      <section className={sx(styles.section)} aria-labelledby={`${id}-can`}>
        <h3 id={`${id}-can`} className={sx(styles.heading)}>{t("shell:tars.guide.canDoTitle")}</h3>
        <ul className={sx(styles.list)}>{CAN_DO.map((n) => <li key={n}>{t(`shell:tars.guide.canDo${n}`)}</li>)}</ul>
      </section>
      <section className={sx(styles.section)} aria-labelledby={`${id}-limits`}>
        <h3 id={`${id}-limits`} className={sx(styles.heading)}>{t("shell:tars.guide.limitsTitle")}</h3>
        <ul className={sx(styles.list)}>{LIMITS.map((n) => <li key={n}>{t(`shell:tars.guide.limit${n}`)}</li>)}</ul>
      </section>
    </div>
  </div>;
}

/**
 * The empty conversation: who Tars is, a few requests to start from, and the
 * full guide one press away. Kept short so the welcome stays in view while
 * the transcript holds to its end.
 */
export function TarsWelcome({ name, onExample }: { name: string; onExample: (text: string) => void }) {
  const { t } = useTranslation(["shell"]);
  const [open, setOpen] = useState(false);
  const guideId = useId();
  return <div className={sx(styles.welcome)} data-tars-welcome="">
    <div className={sx(styles.intro)}>
      <TarsMark className={sx(styles.mark)} />
      <p className={sx(styles.title)}>{t("shell:tars.conversation.welcome", { name })}</p>
      <p className={sx(styles.description)}>{t("shell:tars.conversation.empty")}</p>
    </div>
    <TarsGuideExamples onExample={onExample} />
    <div className={sx(styles.section)}>
      <Button type="button" variant="ghost" size="xs" xstyle={styles.disclosure} aria-expanded={open} aria-controls={guideId} onClick={() => setOpen((value) => !value)} data-tars-guide-toggle="">
        {t("shell:tars.guide.help")}<ChevronDown aria-hidden="true" className={sx(styles.chevron, transition.transform, open && styles.chevronOpen)} />
      </Button>
      <div id={guideId} hidden={!open}>{open ? <TarsGuide /> : null}</div>
    </div>
  </div>;
}

/** The header's help button: the same guide in a popover, so it stays reachable once the conversation has history. */
export function TarsGuideButton({ onExample }: { onExample?: (text: string) => void }) {
  const { t } = useTranslation(["shell"]);
  const label: string = t("shell:tars.guide.help");
  return <Popover>
    <PopoverTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} title={label} data-tars-guide-open="" />}>
      <CircleHelp />
    </PopoverTrigger>
    <PopoverContent align="end" className={sx(styles.popover)} aria-label={label}>
      <TarsGuide onExample={onExample} />
    </PopoverContent>
  </Popover>;
}

const styles = stylex.create({
  root: { display: "flex", flexDirection: "column", gap: vars["--aui-space-20"], minWidth: 0, textAlign: "start" },
  columns: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))", gap: vars["--aui-space-20"], minWidth: 0 },
  section: { display: "flex", flexDirection: "column", gap: vars["--aui-space-8"], minWidth: 0 },
  heading: { margin: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-row"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-control"] },
  list: {
    margin: 0, paddingInlineStart: vars["--aui-space-16"], listStyleType: "disc", display: "flex", flexDirection: "column", gap: vars["--aui-space-4"],
    color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-row"], lineHeight: vars["--aui-line-height-control"],
  },
  /** Upstream Suggestions layout (#809 R3): short xs chips in a wrapping row; the full request goes into the composer. */
  examples: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], minWidth: 0 },
  exampleItem: { maxWidth: "100%", minWidth: 0 },
  welcome: { display: "flex", flexDirection: "column", gap: vars["--aui-space-20"], paddingBlock: vars["--aui-space-24"], minWidth: 0 },
  intro: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: vars["--aui-space-4"], minWidth: 0 },
  mark: { width: vars["--aui-control-icon-size-lg"], height: vars["--aui-control-icon-size-lg"], marginBottom: vars["--aui-space-8"], color: vars["--aui-color-text-muted"] },
  title: { margin: 0, color: vars["--aui-color-text"], fontSize: vars["--aui-font-size-section"], fontWeight: vars["--aui-font-weight-medium"], lineHeight: vars["--aui-line-height-tight"] },
  description: { margin: 0, color: vars["--aui-color-text-muted"], fontSize: vars["--aui-font-size-body"], lineHeight: vars["--aui-line-height-prose"] },
  /** Optically on the column edge: the ghost xs padding (space-8) hangs outside, as the hover fill does. */
  disclosure: { alignSelf: "flex-start", marginInlineStart: `calc(-1 * ${vars["--aui-space-8"]})` },
  chevron: { width: vars["--aui-control-icon-size-sm"], height: vars["--aui-control-icon-size-sm"] },
  chevronOpen: { transform: "rotate(180deg)" },
  popover: { width: "min(36rem, calc(100vw - 2rem))", maxHeight: "min(32rem, calc(100vh - 6rem))", overflowY: "auto" },
});
