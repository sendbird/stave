import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import type { FeatureTipId } from "@/lib/feature-tips";
import { useAppStore } from "@/store/app.store";

function dismissFeatureTip(feature: FeatureTipId) {
  const state = useAppStore.getState();
  const dismissed = state.settings.dismissedFeatureTips;
  if (dismissed.includes(feature)) return;
  state.updateSettings({ patch: { dismissedFeatureTips: [...dismissed, feature] } });
}

/**
 * A one-line offer to turn on an optional feature. It shows until the user
 * closes it or turns tips off in Settings, and each close is remembered.
 */
export function FeatureEnableHint(props: { feature: FeatureTipId; onEnable: () => void }) {
  const { t } = useTranslation("session");
  const visible = useAppStore(
    (state) => state.settings.featureTipsEnabled && !state.settings.dismissedFeatureTips.includes(props.feature),
  );
  if (!visible) return null;
  return (
    <div className={sx(styles.row)} data-feature-hint={props.feature}>
      <span>{t(`featureDiscovery.${props.feature}`)}</span>
      <Button variant="link" size="sm" onClick={props.onEnable}>
        {t("featureDiscovery.enable")}
      </Button>
      <Button variant="quiet" size="2xs" iconOnly aria-label={t("featureDiscovery.dismiss")} onClick={() => dismissFeatureTip(props.feature)}>
        <X />
      </Button>
    </div>
  );
}

const styles = stylex.create({
  row: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: vars["--aui-space-4"],
    color: vars["--aui-color-text-muted"],
    fontSize: vars["--aui-font-size-caption"],
    minWidth: 0,
  },
});
