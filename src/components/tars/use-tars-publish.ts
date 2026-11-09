import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { i18n } from "@/i18n";
import type { TarsConversation } from "@/lib/tars/conversation";
import type { TarsPublishPreview, TarsPublishRecord, TarsPublishSource } from "@/lib/tars/publication";
import { isTarsPublishable, latestTarsPublishRecord, projectTarsPublishProposals, type TarsPublishProposalView } from "@/lib/tars/publish-model";
import type { TarsBridgeApi, TarsResponsibility } from "@/lib/tars/types";
import type { TarsPublishPreviewState, TarsPublishWords } from "./TarsPublishCard";

const NO_RECORDS: readonly TarsPublishRecord[] = [];

/** A card the user opened from the tray, the report or a retry; its id is the confirmation's request id. */
export interface TarsOpenPublishCard { id: string; responsibilityId: string; initial: TarsPublishWords | null }

/** What the conversation needs to show publish cards and their records in place. */
export interface TarsPublishContext {
  proposals: readonly TarsPublishProposalView[];
  /** Confirmations of cards the user opened; a proposal's confirmation shows on its own card's place. */
  records: readonly TarsPublishRecord[];
  open: TarsOpenPublishCard | null;
  rowOf: (responsibilityId: string) => TarsResponsibility | undefined;
  previewOf: (responsibilityId: string) => { preview: TarsPublishPreview | null; state: TarsPublishPreviewState };
  busyId: string | null;
  errors: ReadonlyMap<string, string>;
  declined: ReadonlySet<string>;
  onPublish: (card: { id: string; responsibilityId: string; expectedRevision: number | null }, words: TarsPublishWords, source: TarsPublishSource) => void;
  onDecline: (id: string) => void;
  /** Reopens the card for the newest attempt of work that can still be published; null when it cannot. */
  retryFor: (record: TarsPublishRecord) => (() => void) | null;
}

/**
 * The publish cards of the Tars view: word proposals in the conversation and
 * one card the user opens from the tray or the report. The host reads what a
 * card shows (`previewPublish`) and runs the confirmation (`publish`); this
 * hook only keeps what is on screen. Opening, declining and closing a card are
 * view-only and never recorded.
 */
export function useTarsPublish(args: {
  bridge: TarsBridgeApi | undefined;
  conversation: TarsConversation | null;
  /** Null before a snapshot was read. */
  responsibilities: readonly TarsResponsibility[] | null;
  /** Reads the snapshot and the conversation again after a confirmation. */
  refresh: () => void;
  /** Where focus goes when a card the user opened closes and its opener is gone. */
  focusComposer: () => void;
}) {
  const { bridge, conversation, responsibilities, refresh, focusComposer } = args;
  const [open, setOpen] = useState<TarsOpenPublishCard | null>(null);
  const [previews, setPreviews] = useState<ReadonlyMap<string, { preview: TarsPublishPreview | null; state: TarsPublishPreviewState }>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [declined, setDeclined] = useState<ReadonlySet<string>>(new Set());
  const requested = useRef(new Set<string>());
  const opener = useRef<HTMLElement | null>(null);
  const publications = conversation?.publications ?? NO_RECORDS;
  const rowOf = useCallback((id: string) => responsibilities?.find((row) => row.id === id), [responsibilities]);
  const proposals = useMemo(() => projectTarsPublishProposals({ receipts: conversation?.receipts ?? [], publications, responsibilities }),
    [conversation?.receipts, publications, responsibilities]);
  const records = useMemo(() => publications.filter((record) => record.proposal === null), [publications]);
  const previewKey = (row: Pick<TarsResponsibility, "id" | "revision">) => `${row.id}:${row.revision}`;
  // Each shown card reads what it would publish once per revision of its work.
  const shown = useMemo(() => {
    const ids = new Set(proposals.filter((view) => view.state === "waiting" && !declined.has(view.requestId)).map((view) => view.responsibilityId));
    if (open) ids.add(open.responsibilityId);
    return [...ids].flatMap((id) => { const row = rowOf(id); return row ? [row] : []; });
  }, [declined, open, proposals, rowOf]);
  useEffect(() => {
    if (!bridge?.previewPublish) return;
    for (const row of shown) {
      const key = previewKey(row);
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      setPreviews((current) => new Map(current).set(key, { preview: current.get(key)?.preview ?? null, state: "loading" }));
      void bridge.previewPublish({ responsibilityId: row.id })
        .then((preview) => setPreviews((current) => new Map(current).set(key, { preview, state: "ready" })))
        .catch(() => {
          requested.current.delete(key);
          setPreviews((current) => new Map(current).set(key, { preview: null, state: "failed" }));
        });
    }
  }, [bridge, shown]);
  const previewOf = useCallback((id: string) => {
    const row = rowOf(id);
    const entry = row ? previews.get(previewKey(row)) : undefined;
    return entry ?? { preview: null, state: bridge?.previewPublish ? "loading" as const : "failed" as const };
  }, [bridge, previews, rowOf]);
  // A card whose work left the snapshot, or can no longer be published, closes.
  useEffect(() => {
    if (!open || !responsibilities || busyId === open.id) return;
    const row = rowOf(open.responsibilityId);
    if (!row || !isTarsPublishable(row)) setOpen(null);
  }, [busyId, open, responsibilities, rowOf]);
  const restoreFocus = useCallback(() => {
    const back = opener.current;
    opener.current = null;
    requestAnimationFrame(() => {
      if (back?.isConnected && back.checkVisibility()) back.focus();
      else focusComposer();
    });
  }, [focusComposer]);
  /** Opens the card for one completed responsibility, or brings Tars's own waiting proposal for it into view. */
  const openCard = useCallback((row: TarsResponsibility, initial: TarsPublishWords | null = null) => {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const proposal = proposals.find((view) => view.responsibilityId === row.id && view.state === "waiting" && !declined.has(view.requestId));
    if (proposal && !initial) {
      requestAnimationFrame(() => {
        const card = document.querySelector<HTMLElement>(`[data-tars-publish-card="${CSS.escape(proposal.requestId)}"]`);
        card?.scrollIntoView({ block: "nearest" });
        (card?.querySelector<HTMLElement>("[data-tars-publish-message]") ?? card)?.focus();
      });
      return;
    }
    opener.current = active?.closest("[role='dialog']") ? null : active;
    setOpen({ id: `publish-click:${crypto.randomUUID()}`, responsibilityId: row.id, initial });
  }, [declined, proposals]);
  const onDecline = useCallback((id: string) => {
    if (open?.id === id) { setOpen(null); restoreFocus(); return; }
    setDeclined((current) => new Set(current).add(id));
    focusComposer();
  }, [focusComposer, open?.id, restoreFocus]);
  const onPublish = useCallback<TarsPublishContext["onPublish"]>((card, words, source) => {
    if (!bridge?.publish || busyId) return;
    const row = rowOf(card.responsibilityId);
    // A proposal confirms the revision Tars saw; a card the user opened, the revision its facts were read at.
    const expectedRevision = card.expectedRevision ?? previewOf(card.responsibilityId).preview?.revision ?? row?.revision;
    if (!expectedRevision) return;
    setBusyId(card.id);
    void bridge.publish({ requestId: card.id, responsibilityId: card.responsibilityId, expectedRevision, ...words, source })
      .then(() => {
        setErrors((current) => { const next = new Map(current); next.delete(card.id); return next; });
        if (open?.id === card.id) { setOpen(null); restoreFocus(); }
      })
      .catch(() => setErrors((current) => new Map(current).set(card.id, i18n.t("shell:tars.publish.card.failed"))))
      .finally(() => { setBusyId(null); refresh(); });
  }, [bridge, busyId, open?.id, previewOf, refresh, restoreFocus, rowOf]);
  const retryFor = useCallback((record: TarsPublishRecord) => {
    const row = rowOf(record.responsibilityId);
    if (record.status !== "rejected" || !row || !isTarsPublishable(row) || latestTarsPublishRecord(publications, row.id)?.requestId !== record.requestId) return null;
    return () => openCard(row, { commitMessage: row.publication?.commitMessage ?? record.commitMessage, title: row.publication?.title ?? record.title });
  }, [openCard, publications, rowOf]);
  const context: TarsPublishContext = { proposals, records, open, rowOf, previewOf, busyId, errors, declined, onPublish, onDecline, retryFor };
  return { context, openCard, available: Boolean(bridge?.publish && bridge.previewPublish) };
}
