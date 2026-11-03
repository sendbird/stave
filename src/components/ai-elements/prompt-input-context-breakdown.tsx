import { i18n, useTranslation } from "@/i18n";
import { formatTokenCount } from "@/i18n/format";
import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ads/components/Button";
import { CappedViewport } from "@/components/ads/components/CappedViewport";
import { Loader } from "@/components/ads/components/Loader";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { sx } from "@/components/ads/utils/stylex";
import {
  buildClaudeContextBreakdown,
  type ContextBreakdownRow,
} from "@/lib/providers/claude-context-breakdown";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type {
  ClaudeContextUsageSnapshot,
  ProviderId,
} from "@/lib/providers/provider.types";
import { contextMeterStyles as styles } from "./prompt-input-context-meter.styles";

export type ContextBreakdownState =
  | { status: "idle" | "loading" | "unavailable" }
  | { status: "ready"; snapshot: ClaudeContextUsageSnapshot };

/** Expanded rows list what they are made of, capped so a long tool list scrolls. */
const ITEM_LIST_MAX_BLOCK_SIZE = 160;

function rowLabel(row: ContextBreakdownRow): string {
  return row.labelKey ? i18n.t(row.labelKey) : (row.name ?? row.id);
}

function BreakdownRow(props: { row: ContextBreakdownRow }) {
  useTranslation();
  const [open, setOpen] = useState(false);
  const label = rowLabel(props.row);
  const items = props.row.items;
  const value = (
    <span className={sx(styles.breakdownValue)}>{formatTokenCount(props.row.tokens, { tenths: true })}</span>
  );
  if (!items) {
    return (
      <li className={sx(styles.breakdownRow)} data-context-breakdown-row={props.row.id}>
        <span aria-hidden="true" className={sx(styles.breakdownGutter)} />
        <span className={sx(styles.breakdownLabel)}>{label}</span>
        {value}
      </li>
    );
  }
  return (
    <li className={sx(styles.breakdownExpandable)} data-context-breakdown-row={props.row.id}>
      <Button
        layout="host"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        xstyle={[styles.breakdownRow, styles.breakdownToggle, focusRing.ringInset]}
      >
        <span aria-hidden="true" className={sx(styles.breakdownGutter)}>
          <ChevronRight className={sx(styles.breakdownChevron, open && styles.breakdownChevronOpen)} />
        </span>
        <span className={sx(styles.breakdownLabel)}>{label}</span>
        {value}
      </Button>
      {open ? (
        <CappedViewport
          aria-label={label}
          maxBlockSize={ITEM_LIST_MAX_BLOCK_SIZE}
          role="group"
          xstyle={styles.breakdownItems}
        >
          <ul className={sx(styles.breakdownItemList)}>
            {items.map((item) => (
              <li className={sx(styles.breakdownRow)} key={item.id}>
                <span aria-hidden="true" className={sx(styles.breakdownGutter)} />
                <span className={sx(styles.breakdownItemLabel)} title={item.detail}>
                  {item.label}
                </span>
                <span className={sx(styles.breakdownValue)}>{formatTokenCount(item.tokens, { tenths: true })}</span>
              </li>
            ))}
          </ul>
        </CappedViewport>
      ) : null}
    </li>
  );
}

/**
 * What fills the context window, under the meter's totals. Claude reports its
 * fixed parts; every other provider reports only the total, and the section
 * says so instead of inventing a split.
 */
export function PromptInputContextBreakdown(props: {
  providerId: ProviderId;
  state: ContextBreakdownState;
  usedTokens: number | undefined;
}) {
  useTranslation();
  const headingId = useId();
  const providerLabel = getProviderLabel({ providerId: props.providerId });
  const reported = props.providerId === "claude-code";
  const breakdown =
    props.state.status === "ready"
      ? buildClaudeContextBreakdown(props.state.snapshot, props.usedTokens)
      : null;

  return (
    <section
      aria-labelledby={headingId}
      className={sx(styles.breakdown)}
      data-context-breakdown={reported ? props.state.status : "not-reported"}
    >
      <div className={sx(styles.breakdownHeader)}>
        <h3 className={sx(styles.breakdownTitle)} id={headingId}>
          {i18n.t("composer:contextBreakdown.title")}
        </h3>
        <span className={sx(styles.breakdownProvider)}>{providerLabel}</span>
      </div>
      {!reported ? (
        <p className={sx(styles.breakdownNote)}>{i18n.t("composer:contextBreakdown.notReported")}</p>
      ) : props.state.status === "loading" || props.state.status === "idle" ? (
        <p className={sx(styles.breakdownStatus)}>
          <Loader aria-hidden size="xs" tone="neutral" />
          {i18n.t("composer:contextBreakdown.loading")}
        </p>
      ) : !breakdown || breakdown.rows.length === 0 ? (
        <p className={sx(styles.breakdownNote)}>{i18n.t("composer:contextBreakdown.unavailable")}</p>
      ) : (
        <>
          <ul className={sx(styles.breakdownList)}>
            {breakdown.rows.map((row) => (
              <BreakdownRow key={row.id} row={row} />
            ))}
            {breakdown.conversationTokens !== null ? (
              <li className={sx(styles.breakdownRow)} data-context-breakdown-row="conversation">
                <span aria-hidden="true" className={sx(styles.breakdownGutter)} />
                <span className={sx(styles.breakdownLabel)}>
                  {i18n.t("composer:contextBreakdown.conversation")}
                </span>
                <span className={sx(styles.breakdownValue)}>
                  {formatTokenCount(breakdown.conversationTokens, { tenths: true })}
                </span>
              </li>
            ) : null}
          </ul>
          <p className={sx(styles.breakdownNote)}>{i18n.t("composer:contextBreakdown.note")}</p>
        </>
      )}
    </section>
  );
}
