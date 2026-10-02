import { useId } from "react";
import { Check } from "lucide-react";
import {
  RadioGroupRoot,
  RadioIndicator,
  RadioRoot,
} from "@/components/ads/headless/radio-group";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { menu } from "@/components/ads/recipes/menu";
import { transition } from "@/components/ads/recipes/transition";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { statusBarUsageStyles as styles } from "@/components/layout/status-bar-usage.styles";
import type {
  StatusBarAccountProviderId,
  StatusBarAccountView,
} from "@/components/layout/status-bar-usage.utils";
import { STAVE_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";

/**
 * The foot of a usage meter: which account new turns use, and the way to
 * manage accounts. Running turns, queued messages, and open CLI sessions keep
 * the account they started with, so switching here never interrupts work.
 *
 * Rows take the menu recipe rather than the form `RadioGroup`: this is a quick
 * switch inside a popover, read like a menu, not a settings field.
 */
export function StatusBarAccountSection(props: {
  providerId: StatusBarAccountProviderId;
  providerName: string;
  view: StatusBarAccountView;
}) {
  const labelId = useId();
  const updateSettings = useAppStore((state) => state.updateSettings);
  const { providerId, view } = props;
  return (
    <div className={sx(styles.accountSection)}>
      {view.canSwitch ? (
        <div className={sx(menu.group)}>
          <span id={labelId} className={sx(menu.groupLabel)}>
            Account for new turns
          </span>
          <RadioGroupRoot
            aria-labelledby={labelId}
            className={sx(menu.group, menu.groupCompact)}
            value={view.selected?.id ?? ""}
            onValueChange={(value) => {
              if (typeof value !== "string" || !value || value === view.selected?.id) {
                return;
              }
              updateSettings({
                patch:
                  providerId === "codex"
                    ? { codexAccountProfileId: value }
                    : { claudeAccountProfileId: value },
              });
            }}
          >
            {view.options.map((profile) => (
              <RadioRoot
                key={profile.id}
                value={profile.id}
                aria-label={`${props.providerName}: ${profile.label}`}
                className={(state) =>
                  sx(
                    menu.item,
                    menu.itemPointer,
                    transition.colors,
                    focusRing.ring,
                    styles.accountRow,
                    state.checked && menu.itemChecked,
                  )
                }
              >
                <span className={sx(menu.itemLabel)}>{profile.label}</span>
                {profile.gateway ? (
                  <Tooltip>
                    <TooltipTrigger
                      delay={400}
                      render={<span className={sx(styles.accountMeta)} />}
                    >
                      API billing
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <span className={sx(styles.accountHint)}>
                        Your gateway bills this account per token, not your
                        subscription, and enforces any budget.
                      </span>
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                <RadioIndicator className={sx(menu.itemIndicator)}>
                  <Check aria-hidden size={14} />
                </RadioIndicator>
              </RadioRoot>
            ))}
          </RadioGroupRoot>
        </div>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        xstyle={styles.manageAccounts}
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, {
              detail: { section: "tooling" },
            }),
          )
        }
      >
        {view.canSwitch ? "Manage accounts" : "Add an account"}
      </Button>
    </div>
  );
}
