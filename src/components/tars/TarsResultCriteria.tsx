import { useState } from "react";
import { Check, CircleCheck, CircleDashed, CircleX, Info, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui";
import { Badge, type BadgeTone } from "@/components/aui/components/Badge";
import { InlineDisclosureIcon } from "@/components/aui/components/inline-disclosure-icon";
import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from "@/components/aui/headless/collapsible";
import { controlIconSizes } from "@/components/aui/recipes/control-metrics";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { inlineDisclosure } from "@/components/aui/recipes/inline-disclosure";
import { cx, sx } from "@/components/aui/utils/stylex";
import { summarizeTarsResultCriteria, type TarsResultCriterionKind, type TarsResultModel } from "@/lib/tars/result-model";
import { tarsRecordStyles as recordStyles } from "./tars-record.styles";
import { tarsResultStyles as styles } from "./tars-result.styles";

const PRESENTATION = {
  verifiedCheck: { icon: CircleCheck, tone: "success", mark: "toneVerified" },
  verifiedReview: { icon: CircleCheck, tone: "success", mark: "toneVerified" },
  reported: { icon: Check, tone: "neutral", mark: "toneReported" },
  unmet: { icon: CircleX, tone: "danger", mark: "toneUnmet" },
  unverified: { icon: CircleDashed, tone: "neutral", mark: "toneReported" },
  notReported: { icon: CircleDashed, tone: "neutral", mark: "toneReported" },
} as const satisfies Record<TarsResultCriterionKind, { icon: LucideIcon; tone: BadgeTone; mark: "toneVerified" | "toneReported" | "toneUnmet" }>;

/** Compact source badges and a count of confirmed criteria; the original source wording stays one disclosure away. */
export function TarsResultCriteria({ model, title, onOpenReview }: { model: TarsResultModel; title: string; onOpenReview?: () => void }) {
  const { t } = useTranslation(["shell"]);
  const [open, setOpen] = useState(false);
  const counts = summarizeTarsResultCriteria(model.criteria);
  if (!counts.total) return null;
  return <div className={sx(styles.group)}>
    <div className={sx(styles.criteriaHeader)}>
      <p className={sx(styles.groupLabel)}>{t("shell:tars.result.criteria.title")}</p>
      <p className={sx(styles.criteriaCount)} data-tars-result-count="">
        {counts.reported === counts.total
          ? t("shell:tars.result.criteria.reportedCount", { count: counts.reported, total: counts.total })
          : t("shell:tars.result.criteria.confirmedCount", { count: counts.confirmed, total: counts.total })}
      </p>
    </div>
    <ul className={sx(styles.criteria)} aria-label={t("shell:tars.result.criteria.title")}>
      {model.criteria.map((criterion) => {
        const { icon: Icon, tone, mark } = PRESENTATION[criterion.kind];
        return <li key={criterion.text} className={sx(styles.criterion)} data-tars-result-criterion={criterion.kind}>
          <span className={sx(styles.criterionMark, styles[mark])}><Icon aria-hidden="true" className={sx(styles.criterionIcon)} /></span>
          <span className={sx(styles.criterionText)}>{criterion.text}</span>
          <Badge size="sm" tone={tone} variant="outlined" xstyle={[recordStyles.chip, styles.criterionState]}>{t(`shell:tars.result.criteria.short.${criterion.kind}`)}</Badge>
        </li>;
      })}
    </ul>
    <CollapsibleRoot className={sx(inlineDisclosure.root)} open={open} onOpenChange={setOpen} data-tars-result-evidence="">
      <CollapsibleTrigger aria-label={t("shell:tars.result.criteria.evidenceFor", { title })} className={cx(sx(inlineDisclosure.trigger, inlineDisclosure.triggerIntrinsic, open && inlineDisclosure.triggerOpen, focusRing.ring), "atelier-inline-disclosure-trigger")}>
        <InlineDisclosureIcon open={open}><Info size={controlIconSizes.md} /></InlineDisclosureIcon>
        <span>{t("shell:tars.result.criteria.evidence")}</span>
      </CollapsibleTrigger>
      <CollapsiblePanel className={cx(sx(inlineDisclosure.panel), "atelier-motion-collapse")}>
        <div className={cx(sx(inlineDisclosure.body, styles.group), "atelier-motion-panel-inner")}>
          <ol className={sx(styles.evidenceSources)}>
            {model.criteria.map((criterion) => <li key={criterion.text}>
              <span className={sx(styles.criterionText)}>{criterion.text}</span>{" — "}{t(`shell:tars.result.criteria.${criterion.kind}`)}
            </li>)}
          </ol>
          {model.staveChecks.length ? <p className={sx(styles.checks)} data-tars-result-stave-checks="">
            <span className={sx(styles.criterionMark, styles.toneVerified)}><CircleCheck aria-hidden="true" className={sx(styles.criterionIcon)} /></span>
            <span className={sx(styles.fact)}>{t("shell:tars.result.criteria.staveChecks", { checks: model.staveChecks.join(" · ") })}</span>
          </p> : null}
          <p className={sx(styles.evidenceNote)}>{t("shell:tars.result.criteria.evidenceNote")}</p>
          {onOpenReview ? <Button type="button" size="xs" variant="ghost" data-tars-result-open="review" aria-label={t("shell:tars.result.criteria.openReviewFor", { title })} onClick={onOpenReview}>{t("shell:tars.result.criteria.openReview")}</Button> : null}
        </div>
      </CollapsiblePanel>
    </CollapsibleRoot>
  </div>;
}
