import { sx } from "@/components/ads/utils/stylex";
import { AdvisorCheckIcon } from "@/components/session/AdvisorCheckIcon";
import type { DelegationCheck } from "@/lib/delegation/exchange";
import { delegationStyles as styles } from "./delegation.styles";

/**
 * Pass/fail/pending/skipped checks with a label and a one-line reason.
 * Extracted from the advisor card so the card, the consult log and the panel
 * render a check identically.
 */
export function CheckList(props: { checks: readonly DelegationCheck[] }) {
  if (props.checks.length === 0) {
    return null;
  }
  return (
    <ul className={sx(styles.checkList)}>
      {props.checks.map((check) => (
        <li
          key={check.id}
          className={sx(styles.checkItem)}
          data-check-id={check.id}
          data-check-status={check.status}
        >
          <AdvisorCheckIcon status={check.status} />
          <div className={sx(styles.checkBody)}>
            <p
              className={sx(
                styles.checkLabel,
                check.status === "fail" && styles.checkLabelFail,
              )}
            >
              {check.label}
            </p>
            <p className={sx(styles.checkDetail)}>{check.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
