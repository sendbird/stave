import type { ReactNode } from "react";
import { useTranslation } from "@/i18n";
import { sx } from "@/components/aui/utils/stylex";
import type { TarsReportModel } from "@/lib/tars/report-model";
import type { TarsResponsibility } from "@/lib/tars/types";
import { tarsSummaryExcerpt, tarsSummaryCaveats, tarsEarlierSummaryCaveats } from "@/lib/tars/completion-summary";
import type { MessageTextScale } from "@/components/ai-elements/message-text-scale";
import { TarsOutputList } from "./TarsTray";
import { tarsCompletionStyles as styles } from "./tars-completion.styles";

/** The Report and Result share the frozen text, exceptions and existing output-opening interface. */
export function TarsCompletionOverview({ model, textScale = "panel" }: { model: TarsReportModel; row: TarsResponsibility; outputs?: ReactNode; textScale?: MessageTextScale }) {
  const { t } = useTranslation(["shell"]);
  if (model.state !== "frozen") return null;
  return <p className={sx(styles.lead, styles.headline, textScale === "conversation" && styles.chatText)} data-tars-completion-summary="" title={model.summary ?? undefined}>
    {tarsSummaryExcerpt(model.summary ?? "") || t("shell:tars.completion.noSummary")}
  </p>;
}

/** Original detail stays available in the existing disclosure. */
export function TarsCompletionDetail({ model, row, outputs, textScale = "panel" }: Parameters<typeof TarsCompletionOverview>[0]) {
  const { t } = useTranslation(["shell"]);
  if (model.state !== "frozen") return null;
  const caveats = tarsSummaryCaveats(model);
  const earlier = tarsEarlierSummaryCaveats(model);
  const chatText = textScale === "conversation" && styles.chatText;
  const stale = model.criteria.some((item) => item.status === "met" && item.source.kind === "check" && (item.source.exitCode !== 0 || item.source.freshness !== "current"));
  return <div className={sx(styles.overview)} data-tars-completion-overview="">
    {outputs || model.links.length ? <div data-tars-completion-outputs="">{outputs ?? <TarsOutputList outputs={model.links.map((link) => ({
      ...link, kind: "link", responsibilityId: row.id, title: row.title,
    }))} />}</div> : null}
    {model.criteria.length ? <p className={sx(styles.meta, chatText)} data-tars-completion-count="">{t("shell:tars.completion.criteriaCount", { met: model.criteria.filter((item) => item.status === "met").length, total: model.criteria.length })}</p> : null}
    {model.unmet.length || caveats.length || stale || row.detailCode === "acceptedWithoutVerification" ? <ul className={sx(styles.warnings, chatText)} data-tars-completion-warnings="">
      {model.unmet.map((criterion) => <li key={criterion.text} className={sx(styles.wrap)}>{t(`shell:tars.side.report.status.${criterion.status}`)} · {criterion.text}</li>)}
      {stale ? <li>{t("shell:tars.completion.stale")}</li> : null}
      {row.detailCode === "acceptedWithoutVerification" ? <li>{t("shell:tars.completion.acceptedWithoutVerification")}</li> : null}
      {caveats.map((text) => <li key={text} className={sx(styles.wrap)}>{text}</li>)}
    </ul> : null}
    {earlier.length ? <ul className={sx(styles.notes, chatText)} data-tars-completion-earlier="">
      {earlier.map((stage) => <li key={stage.stageId} className={sx(styles.wrap)}>
        <span>{t("shell:tars.completion.earlierNote", { stage: stage.title })}</span>
        {stage.caveats.map((text) => <p key={text} className={sx(styles.noteText)}>{text}</p>)}
      </li>)}
    </ul> : null}
  </div>;
}
