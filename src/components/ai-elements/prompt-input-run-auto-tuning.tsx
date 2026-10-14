import { useTranslation } from "@/i18n";
import { BadgeCheck, LockKeyhole, SlidersHorizontal } from "lucide-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui";
import { Checkbox } from "@/components/ads/components/Checkbox";
import {
  COMPOSER_CONTROL_BUTTON,
  ComposerControlLabel,
  composerControlAttributes,
} from "./composer-control-density";
import * as stylex from "@stylexjs/stylex";
import { PromptInputRunAccountPoolSection, type PromptInputRunAccountPool } from "./prompt-input-run-account-pool";
import { vars } from "../ads/tokens/tokens.stylex";
import { cx, sx } from "../ads/utils/stylex";

export interface PromptInputRunAutoTuning {
  enabled: boolean;
  locked: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** The Run's account pool choice; null when the provider has one subscription account. */
  accountPool?: PromptInputRunAccountPool | null;
}

export function PromptInputRunAutoTuningControl({ control }: {
  control: PromptInputRunAutoTuning;
}) {
  const { t } = useTranslation("agentRuns");
  const Icon = control.enabled ? BadgeCheck : SlidersHorizontal;
  const stateLabel = t(control.enabled ? "adaptive.on" : "adaptive.off");
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            layout="host"
            {...composerControlAttributes}
            data-testid="run-auto-tuning-control"
            data-auto-tuning-enabled={control.enabled}
            aria-label={t("adaptive.trigger", { state: stateLabel })}
            title={t("adaptive.trigger", { state: stateLabel })}
            className={cx(
              COMPOSER_CONTROL_BUTTON,
              sx(styles.trigger, control.enabled && styles.enabled),
            )}
          />
        }
      >
        <Icon aria-hidden />
        <ComposerControlLabel>
          {t("adaptive.trigger", { state: stateLabel })}
        </ComposerControlLabel>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={8} xstyle={styles.popover}>
        <PopoverTitle>{t("adaptive.controlTitle")}</PopoverTitle>
        <PopoverDescription>{t("adaptive.summary")}</PopoverDescription>
        <Checkbox
          checked={control.enabled}
          disabled={control.locked}
          label={t("adaptive.enable")}
          onCheckedChange={(checked) => control.onEnabledChange(checked === true)}
        />
        <p className={sx(styles.copy, styles.scope)}>
          {control.locked ? (
            <LockKeyhole aria-hidden className={sx(styles.lock)} />
          ) : null}
          {t(control.locked ? "adaptive.locked" : "adaptive.nextRun")}
        </p>
        <p className={sx(styles.copy)}>{t("adaptive.description")}</p>
        {control.accountPool ? <PromptInputRunAccountPoolSection pool={control.accountPool} /> : null}
      </PopoverContent>
    </Popover>
  );
}

const styles = stylex.create({
  trigger: { justifyContent: "flex-start", maxWidth: "100%" },
  enabled: {
    color: "var(--primary)",
    backgroundColor: "color-mix(in oklch, var(--primary) 12%, transparent)",
  },
  popover: {
    width: "min(22rem, calc(100dvw - 32px))",
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
  },
  copy: {
    fontSize: vars["--ads-font-size-body"],
    color: vars["--ads-color-text-muted"],
    margin: 0,
  },
  scope: { display: "flex", alignItems: "flex-start", gap: vars["--ads-space-8"] },
  lock: { width: 16, height: 16, flexShrink: 0, color: vars["--ads-color-text-muted"] },
});
