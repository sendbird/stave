import { useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import { sx } from "@/components/aui/utils/stylex";
import { TarsRecordList, TarsRecordRow } from "./TarsRecord";
import { tarsDockStyles as styles } from "./tars-decision-dock.styles";

export interface TarsDockItem { id: string; node: ReactNode }
export interface TarsDecisionDockController { show: (id: string) => void; skip: () => void }

/** Removal advances from the same slot, so answering a later question does not jump back to the first. */
export function tarsDockIndex(ids: readonly string[], selected: { id: string; index: number } | null) {
  if (!ids.length) return -1;
  const found = selected ? ids.indexOf(selected.id) : -1;
  return found >= 0 ? found : Math.min(selected?.index ?? 0, ids.length - 1);
}

/** History keeps the question and its entry point, but never a second active answer form. */
export function TarsWaitingRecord({ id, subject, onOpen }: {
  id: string; subject: string; onOpen: () => void;
}) {
  const { t } = useTranslation(["shell"]);
  return <TarsRecordList><TarsRecordRow state="pending" subject={subject} data-tars-waiting-record={id}
    actions={<Button size="xs" variant="quiet" onClick={onOpen}>{t("shell:tars.dock.review")}</Button>} /></TarsRecordList>;
}

/** View-only queue. Forms stay mounted while hidden so changing questions preserves selections and publish words. */
export function TarsDecisionDock({ items, controller, busy, preferredId, onEmptyFocus, onDismiss }: {
  items: readonly TarsDockItem[]; controller?: Ref<TarsDecisionDockController>; busy: boolean;
  /** A publish card explicitly opened by the user takes the active slot. */
  preferredId?: string;
  onEmptyFocus: (lastId: string) => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation(["shell"]);
  const labelId = useId();
  const root = useRef<HTMLElement>(null);
  const focused = useRef(false);
  const previous = useRef<string | undefined>(undefined);
  const lastPreferred = useRef<string | undefined>(undefined);
  const [selected, setSelected] = useState<{ id: string; index: number } | null>(null);
  const [focusRequest, requestFocus] = useState(0);
  const lastFocusRequest = useRef(0);
  const ids = items.map((item) => item.id);
  const preferredIndex = preferredId ? ids.indexOf(preferredId) : -1;
  const newPreferred = preferredIndex >= 0 && preferredId !== lastPreferred.current;
  const index = newPreferred ? preferredIndex : tarsDockIndex(ids, selected);
  const activeId = items[index]?.id;
  const show = (id: string) => {
    const next = ids.indexOf(id);
    if (next < 0 || busy) return;
    setSelected({ id, index: next });
    requestFocus((value) => value + 1);
  };
  useImperativeHandle(controller, () => ({ show, skip: () => {
    if (items.length > 1) show(ids[(index + 1) % items.length]!); else onDismiss();
  } }));
  useLayoutEffect(() => {
    const focusCard = () => {
      const active = root.current?.querySelector<HTMLElement>("[data-tars-dock-item]:not([hidden])");
      (active?.querySelector<HTMLElement>("[data-tars-publish-message]")
        ?? active?.querySelector<HTMLElement>("[data-tars-decision], [data-tars-publish-card]") ?? root.current)?.focus();
    };
    const last = previous.current;
    if (activeId && (newPreferred || focusRequest !== lastFocusRequest.current || (last && last !== activeId && focused.current))) focusCard();
    lastFocusRequest.current = focusRequest;
    if (!activeId && last && focused.current) { focused.current = false; onEmptyFocus(last); }
    previous.current = activeId;
    if (newPreferred || !preferredId) lastPreferred.current = preferredId;
    // Remember the fallback slot after removal, without changing selection on unrelated refreshes.
    if (activeId && (selected?.id !== activeId || selected.index !== index)) setSelected({ id: activeId, index });
    else if (!activeId && selected) setSelected(null);
  }, [activeId, index, focusRequest, newPreferred, preferredId, onEmptyFocus, selected]);
  if (!activeId) return null;
  return <section ref={root} className={sx(styles.root)} aria-labelledby={labelId} data-tars-decision-dock="" aria-busy={busy || undefined}
    onFocusCapture={() => { focused.current = true; }} onBlurCapture={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) focused.current = false;
    }}>
    <div className={sx(styles.header)}>
      <p id={labelId} className={sx(styles.label)} role="status">{t("shell:tars.dock.position", { position: index + 1, count: items.length })}</p>
      <div className={sx(styles.navigation)}>
        <Button size="xs" variant="quiet" iconOnly aria-label={t("shell:tars.dock.previous")} title={t("shell:tars.dock.previous")} disabled={busy || index === 0} onClick={() => show(ids[index - 1]!)}
          data-tars-dock-previous=""><ChevronLeft aria-hidden="true" /></Button>
        <Button size="xs" variant="quiet" iconOnly aria-label={t("shell:tars.dock.next")} title={t("shell:tars.dock.next")} disabled={busy || index === items.length - 1} onClick={() => show(ids[index + 1]!)}
          data-tars-dock-next=""><ChevronRight aria-hidden="true" /></Button>
      </div>
    </div>
    <div className={sx(styles.body)} data-tars-dock-body="">
      {items.map((item) => <div key={item.id} hidden={item.id !== activeId} data-tars-dock-item={item.id}>{item.node}</div>)}
    </div>
  </section>;
}
