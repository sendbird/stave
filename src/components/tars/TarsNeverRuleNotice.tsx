import { useTranslation } from "@/i18n";
import { Alert } from "@/components/aui/components/Alert";
import { sx } from "@/components/aui/utils/stylex";
import type { TarsNeverRuleMatch } from "@/lib/tars/autonomy";
import { tarsAutonomyStyles as styles } from "./tars-autonomy.styles";
import { tarsDecisionStyles as card } from "./tars-decision.styles";

/**
 * On a confirmation card: the user's own "never do" rules the host matched
 * for the proposed action, each with the word that matched. It says the rule
 * made Stave ask first, and that it blocks nothing: the choice stays the user's.
 */
export function TarsNeverRuleNotice({ matches }: { matches: readonly TarsNeverRuleMatch[] | undefined }) {
  const { t } = useTranslation(["shell"]);
  if (!matches?.length) return null;
  // An in-context alert in the card's secondary type, as a refused attempt is. It is part of the card as saved, so a status, never announced as new.
  return <Alert tone="warning" role="status" xstyle={card.attempt} title={t("shell:tars.autonomy.card.title", { count: matches.length })} data-tars-never-rule-notice="">
    <ul className={sx(styles.matches)}>
      {matches.map((match) => <li key={`${match.why}:${match.rule}`} data-tars-never-rule-match={match.why}>
        {t(`shell:tars.autonomy.card.match.${match.why}`, { rule: match.rule, value: match.value })}</li>)}
    </ul>
    {t("shell:tars.autonomy.card.note")}
  </Alert>;
}
