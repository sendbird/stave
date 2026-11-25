import * as stylex from "@stylexjs/stylex";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import type { TarsQuestionPreview as QuestionPreview } from "@/lib/tars/types";

export function TarsPriorEvidence({ evidence }: { evidence: string }) {
  const { t } = useTranslation(["shell"]);
  return <p className={sx(styles.text)} data-tars-prior-evidence="">
    <strong>{t("shell:tars.decision.priorEvidence")}</strong> {evidence}
  </p>;
}

/** Read-only choices. The waiting decision in Tars owns the answer. */
export function TarsQuestionPreview({ question }: { question: QuestionPreview }) {
  const { t } = useTranslation(["composer"]);
  return <div className={sx(styles.preview)} data-tars-question-preview="">
    <p className={sx(styles.text)}><strong>{question.question}</strong></p>
    {question.priorEvidence ? <TarsPriorEvidence evidence={question.priorEvidence} /> : null}
    <ul className={sx(styles.options)}>
      {question.options.map((option, index) => (
        <li key={option.label} className={sx(styles.text)}>
          <strong>{option.label}</strong>
          {question.recommended === index ? <> · {t("composer:userInputCard.copy")}</> : null}
          <p className={sx(styles.text)}>{option.rationale}</p>
        </li>
      ))}
    </ul>
  </div>;
}

const styles = stylex.create({
  preview: { display: "grid", gap: vars["--aui-space-8"], minWidth: 0 },
  options: { display: "grid", gap: vars["--aui-space-4"], listStyle: "none", margin: 0, padding: 0 },
  text: { margin: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" },
});
