import type { MessageTextScale } from "@/components/ai-elements/message-text-scale";
import { useState, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { InlineDisclosureIcon } from "@/components/aui/components/inline-disclosure-icon";
import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from "@/components/aui/headless/collapsible";
import { inlineDisclosure } from "@/components/aui/recipes/inline-disclosure";
import { controlIconSizes } from "@/components/aui/recipes/control-metrics";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { cx, sx } from "@/components/aui/utils/stylex";
import { tarsCompletionStyles as styles } from "./tars-completion.styles";

/** Evidence and complete text remain available without dominating the first view. */
export function TarsResultDetails({ label, children, textScale = "panel" }: { label: string; children: ReactNode; textScale?: MessageTextScale }) {
  const [open, setOpen] = useState(false);
  return <CollapsibleRoot open={open} onOpenChange={setOpen} className={sx(inlineDisclosure.root)} data-tars-result-details="">
    <CollapsibleTrigger className={cx(sx(inlineDisclosure.trigger, focusRing.ring, styles.disclosure, textScale === "conversation" && styles.chatText), "atelier-inline-disclosure-trigger")}>
      <InlineDisclosureIcon open={open}><FileText size={controlIconSizes.md} /></InlineDisclosureIcon>
      <span className={sx(styles.wrap)}>{label}</span>
    </CollapsibleTrigger>
    <CollapsiblePanel keepMounted className={sx(inlineDisclosure.panel)}>
      <div className={sx(styles.detail)}>{children}</div>
    </CollapsiblePanel>
  </CollapsibleRoot>;
}
