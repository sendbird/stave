import { useState } from "react";
import { useTranslation } from "@/i18n";
import { sx } from "@/components/aui/utils/stylex";
import { Button } from "@/components/ui";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import { confirmFleetTarsDecision } from "@/lib/fleet/tars-decision-confirm";
import { isTarsTaskOperation, type TarsControlOperation } from "@/lib/tars/types";
import { useAppStore } from "@/store/app.store";
import { tarsBridge } from "@/store/tars-snapshot-store";
import { inboxRowStyles as rowStyles } from "./inbox-row.styles";

const CONFIRM_LABEL_KEY = {
  pause: "fleet:tarsAttention.confirm.pause",
  resume: "fleet:tarsAttention.confirm.resume",
  cancel: "fleet:tarsAttention.confirm.cancel",
  takeover: "fleet:tarsAttention.confirm.takeover",
  handBack: "fleet:tarsAttention.confirm.handBack",
  acceptCompletion: "fleet:tarsAttention.confirm.acceptCompletion",
  startNow: "fleet:tarsAttention.confirm.startNow",
  extend: "fleet:tarsAttention.confirm.extend",
  retryStage: "fleet:tarsAttention.confirm.retryStage",
  skipStage: "fleet:tarsAttention.confirm.skipStage",
  signOff: "fleet:tarsAttention.confirm.signOff",
  approve: "fleet:tarsAttention.confirm.approve",
  deny: "fleet:tarsAttention.confirm.deny",
  answer: "fleet:tarsAttention.confirm.answer",
  message: "fleet:tarsAttention.confirm.message",
  requestChanges: "fleet:tarsAttention.confirm.requestChanges",
} as const satisfies Record<TarsControlOperation, string>;

/**
 * Confirm on a Tars decision row: names what it confirms, sends it through
 * Tars, and on a refusal says why in the row, translated.
 */
export function FleetTarsDecisionConfirm(props: { item: FleetAttentionItem; disabled: boolean }) {
  const { t } = useTranslation(["fleet", "shell"]);
  const [pending, setPending] = useState(false);
  const [failureKey, setFailureKey] = useState<string | null>(null);
  const decision = props.item.tarsDecision;
  // An answer in the task (approve, answer, words) is confirmed only on the conversation card that shows it; the row offers Tars instead.
  if (!decision || isTarsTaskOperation(decision.operation)) return null;
  const label = t(CONFIRM_LABEL_KEY[decision.operation]);
  const confirm = async () => {
    setPending(true);
    setFailureKey(null);
    const outcome = await confirmFleetTarsDecision(props.item, tarsBridge());
    setPending(false);
    if (!outcome.ok) setFailureKey(outcome.reasonKey);
  };
  return (
    <>
      <Button
        type="button"
        size="sm"
        xstyle={rowStyles.rowAction}
        disabled={props.disabled || pending}
        aria-label={t("fleet:tarsAttention.confirmLabel", { action: label, title: props.item.taskTitle ?? "" })}
        onClick={() => void confirm()}
      >
        {label}
      </Button>
      {failureKey ? (
        <span className={sx(rowStyles.rowError)} role="alert">
          {t(failureKey as "shell:tars.controlReasons.unknown")}
        </span>
      ) : null}
    </>
  );
}

/** Opens Tars, where the conversation behind a Tars row lives. */
export function FleetOpenInTarsButton(props: { item: FleetAttentionItem; disabled: boolean }) {
  const { t } = useTranslation(["fleet"]);
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      xstyle={rowStyles.rowAction}
      disabled={props.disabled}
      aria-label={t("fleet:tarsAttention.openInTarsLabel", { title: props.item.taskTitle ?? "" })}
      onClick={() => useAppStore.getState().openTars()}
    >
      {t("fleet:tarsAttention.openInTars")}
    </Button>
  );
}
