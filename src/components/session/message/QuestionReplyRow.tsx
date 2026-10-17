import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { CircleHelp } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import type { QuestionReply } from "@/lib/question-reply";
import { InlineDisclosureIcon } from "@/components/ads/components/inline-disclosure-icon";
import { CollapsibleRoot, CollapsibleTrigger, CollapsiblePanel } from "@/components/ads/headless/collapsible";
import { inlineDisclosure } from "@/components/ads/recipes/inline-disclosure";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { transition } from "@/components/ads/recipes/transition";
import { controlIconSizes } from "@/components/ads/recipes/control-metrics";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { cx, sx } from "@/components/ads/utils/stylex";

const styles = stylex.create({
  header: { display: "flex", justifyContent: "flex-end", minInlineSize: 0 },
  label: { fontSize: vars["--ads-font-size-caption"], minInlineSize: 0, overflowWrap: "anywhere" },
  body: { padding: vars["--ads-space-12"], gap: vars["--ads-space-16"] },
  pair: { margin: 0, display: "grid", gap: vars["--ads-space-8"], minInlineSize: 0 },
  question: { color: vars["--ads-color-text-muted"], whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
  answer: { color: vars["--ads-color-text"], margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
});

/** Readable even when the original question card is outside the loaded transcript. */
export function QuestionReplyRow({ reply }: { reply: QuestionReply }) {
  useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <CollapsibleRoot open={open} onOpenChange={setOpen} className={sx(inlineDisclosure.root)} data-question-reply>
      <div className={sx(styles.header)}>
        <CollapsibleTrigger className={cx(sx(inlineDisclosure.trigger, inlineDisclosure.triggerIntrinsic,
          open && inlineDisclosure.triggerOpen, transition.colors, focusRing.ring, focusRing.ringInset), "atelier-inline-disclosure-trigger")}>
          <InlineDisclosureIcon open={open}><CircleHelp size={controlIconSizes.md} /></InlineDisclosureIcon>
          <span className={sx(styles.label)}>
            {i18n.t(reply.denied ? "session:questionReply.declined" : "session:questionReply.label", { count: reply.questions.length })}
          </span>
        </CollapsibleTrigger>
      </div>
      <CollapsiblePanel className={cx(sx(inlineDisclosure.panel), "atelier-motion-collapse")}>
        <div className={cx(sx(inlineDisclosure.body, styles.body), "atelier-motion-panel-inner")}>
          {reply.questions.map(({ question, answer }, index) => (
            <dl key={index} className={sx(styles.pair)}>
              <dt className={sx(styles.question)}>{question}</dt>
              <dd className={sx(styles.answer)}>
                {i18n.t("session:questionReply.answer", { answer: answer || i18n.t(reply.denied ? "session:questionReply.declinedAnswer" : "session:questionReply.noAnswer") })}
              </dd>
            </dl>
          ))}
        </div>
      </CollapsiblePanel>
    </CollapsibleRoot>
  );
}
