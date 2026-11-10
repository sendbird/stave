import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Info } from "lucide-react";
import { useTranslation } from "@/i18n";
import { InlineDisclosureIcon } from "@/components/aui/components/inline-disclosure-icon";
import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from "@/components/aui/headless/collapsible";
import { controlIconSizes } from "@/components/aui/recipes/control-metrics";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { inlineDisclosure } from "@/components/aui/recipes/inline-disclosure";
import { transition } from "@/components/aui/recipes/transition";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { cx, sx } from "@/components/aui/utils/stylex";
import { agentRunStyles } from "@/components/agent-runs/agent-runs.styles";

const styles = stylex.create({
  text: { margin: 0, color: vars["--aui-color-text-muted"], whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
});

/**
 * The run's or provider's own words behind a translated detail line, folded
 * by default: the line says what happened in the user's language, and this
 * keeps the untranslated diagnostic one click away for troubleshooting.
 */
export function TarsDiagnosticDetail({ text }: { text: string }) {
  const { t } = useTranslation(["shell"]);
  const [open, setOpen] = useState(false);
  return <CollapsibleRoot className={sx(inlineDisclosure.root)} open={open} onOpenChange={setOpen} data-tars-diagnostic="">
    <CollapsibleTrigger className={cx(sx(inlineDisclosure.trigger, inlineDisclosure.triggerIntrinsic, open && inlineDisclosure.triggerOpen,
      transition.colors, focusRing.ring), "atelier-inline-disclosure-trigger")}>
      <InlineDisclosureIcon open={open}><Info size={controlIconSizes.md} /></InlineDisclosureIcon>
      <span>{t("shell:tars.detail.diagnostic")}</span>
    </CollapsibleTrigger>
    <CollapsiblePanel className={cx(sx(inlineDisclosure.panel), "atelier-motion-collapse")}>
      <div className={cx(sx(inlineDisclosure.body), "atelier-motion-panel-inner")}>
        {/* i18n-ignore: the run's or provider's own diagnostic, shown as written */}
        <p className={sx(agentRunStyles.mono, styles.text)}>{text}</p>
      </div>
    </CollapsiblePanel>
  </CollapsibleRoot>;
}
