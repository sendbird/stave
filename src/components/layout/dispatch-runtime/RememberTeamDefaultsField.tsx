import { Switch } from "@/components/ui";

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
  const controlLabel = `Remember for ${props.scopeLabel} issues`;
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="min-w-0">
        <label
          htmlFor={`${props.idPrefix}-remember-project`}
          className="text-sm font-medium text-foreground"
        >
          {controlLabel}
        </label>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          Stored only in Stave. Future {props.scopeLabel} jobs preselect this
          project, model, effort, and Advisor. Access settings always re-derive
          from your current Stave settings.
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
