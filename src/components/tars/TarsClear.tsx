import { useId, useState, type KeyboardEvent } from "react";
import { Eraser } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { formatList } from "@/i18n/format";
import { Button } from "@/components/ui";
import { Badge } from "@/components/aui/components/Badge";
import { IconTile, iconTileGlyphSizes } from "@/components/aui/components/IconTile";
import { Kbd } from "@/components/aui/components/Kbd";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { agentSurface } from "@/components/aui/recipes/agent-surface";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { sx } from "@/components/aui/utils/stylex";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import type { TarsClearRecord, TarsClearScope, TarsClearSource } from "@/lib/tars/clearing";
import type { TarsSuggestion } from "@/lib/tars/suggestions";
import { tarsPublishCardKey } from "./TarsPublishCard";
import { TarsRecordDetail, TarsRecordList, TarsRecordRow } from "./TarsRecord";
import { tarsDecisionStyles as styles } from "./tars-decision.styles";
import { tarsClearStyles as clearStyles } from "./tars-clear.styles";

/** What a clear of each scope would hide now, as the view counts it. */
export type TarsClearCounts = Record<TarsClearScope, number>;

/** What one clear hid, in a list: "12 messages, 3 Done cards and outputs of 2 ended work items". */
function describeHidden(record: TarsClearRecord) {
  return formatList([
    record.hiddenMessages !== undefined ? i18n.t("shell:tars.clear.hidden.conversation", { count: record.hiddenMessages }) : null,
    record.done ? i18n.t("shell:tars.clear.hidden.done", { count: record.done.length }) : null,
    record.outputs ? i18n.t("shell:tars.clear.hidden.outputs", { count: record.outputs.length }) : null,
  ].filter((part): part is string => part !== null));
}

/**
 * One saved clear as a record: what it hid, whether it came from Tars's card,
 * and Undo (Restore for the conversation) while it holds. An undone clear
 * stays as a record that says it was restored.
 */
export function TarsClearRecordLine({ record, busy, error, onUndo }: { record: TarsClearRecord; busy?: boolean; error?: string | null; onUndo?: () => void }) {
  const { t } = useTranslation(["shell"]);
  const undone = record.status === "undone";
  const conversation = record.scopes.includes("conversation");
  return <TarsRecordRow state={undone ? "skipped" : "applied"} icon={Eraser} data-tars-clear-record={record.requestId} data-tars-clear-status={record.status}
    data-tars-clear-scopes={record.scopes.join(",")}
    lead={t(undone ? "shell:tars.clear.record.undone" : "shell:tars.clear.record.applied")} subject={describeHidden(record)}
    status={record.proposal ? t("shell:tars.clear.record.fromTars") : undefined}
    detail={error ? <TarsRecordDetail role="alert">{error}</TarsRecordDetail> : null}
    actions={!undone && onUndo ? <Button variant="ghost" size="2xs" disabled={busy} data-tars-clear-undo={record.requestId} onClick={onUndo}>
      {t(conversation ? "shell:tars.clear.restore" : "shell:tars.clear.undo")}</Button> : null} />;
}

/**
 * Tars's proposal to clear, waiting for the user. It says what each scope
 * would hide now and what always stays; Clear (Enter) applies it through the
 * same path as the buttons, Not now (Esc) leaves everything as it is. Clearing
 * can be undone, so Clear may be the filled default.
 */
export function TarsClearCard({ id, scopes, counts, busy = false, error, onConfirm, onDecline }: {
  id: string;
  scopes: readonly TarsClearScope[];
  counts: TarsClearCounts;
  busy?: boolean;
  error?: string | null;
  onConfirm: (source: TarsClearSource) => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation(["shell"]);
  const titleId = useId();
  const hintId = useId();
  const nothing = scopes.every((scope) => counts[scope] === 0);
  const confirmClear = (source: TarsClearSource) => { if (!busy && !nothing) onConfirm(source); };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const action = tarsPublishCardKey(event);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "decline") onDecline(); else confirmClear("key");
  };
  return <section role="group" tabIndex={-1} aria-labelledby={titleId} aria-describedby={hintId} aria-busy={busy || undefined}
    className={sx(styles.card, focusRing.ring)} onKeyDown={onKeyDown} data-tars-clear-card={id} data-tars-clear-scopes={scopes.join(",")}>
    <div className={sx(styles.confirmHeader)}>
      <IconTile size="sm" xstyle={styles.icon}><Eraser aria-hidden size={iconTileGlyphSizes.sm} /></IconTile>
      <div className={sx(styles.heading)}>
        <p id={titleId} className={sx(styles.title)}>{t("shell:tars.clear.card.title")}</p>
        <p className={sx(styles.subtitle)}>{t("shell:tars.clear.card.subtitle")}</p>
      </div>
      <div className={sx(styles.tags)}><Badge size="md" tone="warning">{t("shell:tars.conversation.receipts.proposed")}</Badge></div>
    </div>
    <dl className={sx(agentSurface.well, styles.rows)} aria-label={t("shell:tars.clear.card.details")}>
      {scopes.map((scope) => <div key={scope} className={sx(styles.row)} data-tars-clear-row={scope}>
        <dt className={sx(styles.rowLabel)}>{t(`shell:tars.clear.scope.${scope}`)}</dt>
        <dd className={sx(styles.rowValue)}>{t(`shell:tars.clear.hidden.${scope}`, { count: counts[scope] })}</dd>
      </div>)}
    </dl>
    <p className={sx(styles.detail)}>{t("shell:tars.clear.card.kept")}</p>
    {nothing ? <p className={sx(styles.detail)} data-tars-clear-nothing="">{t("shell:tars.clear.card.nothing")}</p> : null}
    <div className={sx(styles.footer)}>
      <VisuallyHidden id={hintId}>{t("shell:tars.clear.card.keysHint")}</VisuallyHidden>
      <div className={sx(styles.footerActions)}>
        <Button type="button" size="2xs" variant="ghost" aria-keyshortcuts="Escape" disabled={busy} data-tars-clear-decline="" onClick={onDecline}>
          {t("shell:tars.clear.card.decline")}<span className={sx(styles.keys)} aria-hidden="true"><Kbd size="sm">{t("shell:tars.publish.card.escKey")}</Kbd></span>
        </Button>
        <Button type="button" size="xs" variant="default" aria-keyshortcuts="Enter" disabled={busy || nothing} data-tars-clear-confirm="" onClick={() => confirmClear("click")}>
          {t("shell:tars.clear.card.confirm")}<span className={sx(styles.keys)} aria-hidden="true"><Kbd size="sm">{t("shell:tars.publish.card.enterKey")}</Kbd></span>
        </Button>
      </div>
    </div>
    {error ? <p className={sx(styles.error)} role="alert">{error}</p> : null}
  </section>;
}

/** A settled proposal's record in place of its card. */
export function TarsClearProposalRecord({ record, busy, error, onUndo }: { record: TarsClearRecord; busy?: boolean; error?: string | null; onUndo?: () => void }) {
  return <TarsRecordList><TarsClearRecordLine record={record} busy={busy} error={error} onUndo={onUndo} /></TarsRecordList>;
}

/**
 * The header's Clear conversation: one confirmation that says what leaves the
 * view and what stays, then the clear. Disabled while there is nothing to hide.
 */
export function TarsClearConversationButton({ count, busy, error, onClear }: { count: number; busy: boolean; error?: string | null; onClear: () => Promise<boolean> }) {
  const { t } = useTranslation(["shell"]);
  const [open, setOpen] = useState(false);
  const label = t("shell:tars.clear.conversation.button");
  return <>
    <Button variant="ghost" size="icon-sm" disabled={busy || count === 0} aria-label={label} title={label} data-tars-clear-conversation="" onClick={() => setOpen(true)}><Eraser /></Button>
    <ConfirmDialog open={open} loading={busy} title={t("shell:tars.clear.conversation.title")}
      description={t("shell:tars.clear.conversation.description", { count })} confirmLabel={t("shell:tars.clear.conversation.confirm")}
      cancelLabel={t("shell:tars.clear.card.decline")} onCancel={() => setOpen(false)}
      onConfirm={() => { void onClear().then((ok) => { if (ok) setOpen(false); }); }}>
      {/* A clear that did not go through keeps the dialog open with the reason, so Clear can be pressed again. */}
      {error ? <p className={sx(styles.error)} role="alert">{error}</p> : null}
    </ConfirmDialog>
  </>;
}

/**
 * Suggested requests above the composer. A press puts its words in the message
 * box and focuses it; nothing is sent until the user sends it.
 */
export function TarsSuggestionChips({ items, onPick }: { items: readonly TarsSuggestion[]; onPick: (text: string) => void }) {
  const { t } = useTranslation(["shell"]);
  if (!items.length) return null;
  return <ul className={sx(clearStyles.chips)} aria-label={t("shell:tars.suggestions.label")} data-tars-suggestions={items.length}>
    {items.map((item) => {
      const values = { title: item.title ?? "", count: item.count };
      const prompt = t(`shell:tars.suggestions.${item.kind}.prompt`, { ...values, title: item.fullTitle ?? "" });
      return <li key={item.id} className={sx(clearStyles.chipItem)}>
        <Button type="button" variant="secondary" size="xs" xstyle={clearStyles.chipButton} title={prompt} data-tars-suggestion={item.kind} onClick={() => onPick(prompt)}>
          <span className={sx(clearStyles.chipLabel)}>{t(`shell:tars.suggestions.${item.kind}.label`, values)}</span>
        </Button>
      </li>;
    })}
  </ul>;
}
