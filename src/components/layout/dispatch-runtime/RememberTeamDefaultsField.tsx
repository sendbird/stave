import { i18n, useTranslation } from "@/i18n";
import { sx } from "@/components/ads/utils/stylex";
import { Switch } from "@/components/ui";
import { dispatchFieldStyles } from "./dispatch-runtime.styles";

export interface RememberTeamDefaultsFieldProps {
  /** Namespaces the DOM id so two dispatch surfaces can coexist on screen. */
  idPrefix: string;
  /** Short label the caller supplies, e.g. a team key or a project name. */
  scopeLabel: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** The "remember these local defaults" affordance for a dispatch scope. */
export function RememberTeamDefaultsField(
  props: RememberTeamDefaultsFieldProps,
) {
  const { t: tI18n } = useTranslation(["kickoff"]);
  const controlLabel = tI18n("kickoff:rememberTeamDefaultsField.rememberForValueIssues", { value1: props.scopeLabel });
  return (
    <div className={sx(dispatchFieldStyles.panelRowTinted)}>
      <div className={sx(dispatchFieldStyles.rowText)}>
        <label
          htmlFor={`${props.idPrefix}-remember-project`}
          className={sx(dispatchFieldStyles.rowLabel)}
        >
          {controlLabel}
        </label>
        <p className={sx(dispatchFieldStyles.rowDescription)}>
          {tI18n("kickoff:rememberTeamDefaultsField.storageHint", { scope: props.scopeLabel })}
        </p>
      </div>
      <Switch
        id={`${props.idPrefix}-remember-project`}
        checked={props.checked}
        onCheckedChange={props.onCheckedChange}
        aria-label={controlLabel}
      />
    </div>
  );
}
