import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { i18n } from "@/i18n";
import type { TarsBridgeApi } from "@/lib/tars/types";
import type { TarsAnswerInput, TarsAnswerResult, TarsConversation, TarsConversationSettings, TarsMessage, TarsMessageInput } from "@/lib/tars/conversation";
import { coalesceTarsReads } from "@/store/tars-snapshot-store";
import { createTarsRequestQueue } from "./use-tars";

export function mergeTarsMessage(conversation: TarsConversation, message: TarsMessage): TarsConversation {
  const previous = conversation.messages.find((item) => item.id === message.id);
  if (previous && previous.revision > message.revision) return conversation;
  return { ...conversation, messages: previous ? conversation.messages.map((item) => item.id === message.id ? message : item) : [...conversation.messages, message] };
}

export function useTarsConversation(bridge: TarsBridgeApi | undefined) {
  const [conversation, setConversation] = useState<TarsConversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef<TarsConversation>({ settings: null, messages: [], receipts: [], activity: [], records: [] });
  const mounted = useRef(false);
  const mutating = useRef(false);
  const queue = useRef(createTarsRequestQueue());
  const available = Boolean(bridge?.getConversation && bridge.sendMessage && bridge.cancelMessage && bridge.configureConversation);
  const apply = useCallback((value: TarsConversation) => { latest.current = value; if (mounted.current) setConversation(value); }, []);
  const fail = useCallback((cause: unknown) => { if (mounted.current) setError(cause instanceof Error ? cause.message : i18n.t("shell:tars.conversation.failed")); }, []);
  // A change during a read schedules one trailing read, so the last change is never missed.
  const refresh = useMemo(() => coalesceTarsReads(async () => {
    if (!bridge?.getConversation) return;
    try { await queue.current(async () => { apply(await bridge.getConversation!()); if (mounted.current) setError(null); }); }
    catch (cause) { fail(cause); }
  }), [apply, bridge, fail]);
  const mutate = useCallback(async <T,>(operation: () => Promise<T>): Promise<T | null> => {
    if (!available || mutating.current) return null;
    mutating.current = true; setBusy(true);
    try { const result = await queue.current(operation); if (mounted.current) setError(null); void refresh(); return result; }
    catch (cause) { fail(cause); return null; }
    finally { mutating.current = false; if (mounted.current) setBusy(false); }
  }, [available, fail, refresh]);
  const send = useCallback((input: TarsMessageInput, initialSettings: TarsConversationSettings) => mutate(async () => {
    // Initialize once from the app defaults. Sending never rewrites a saved global choice.
    if (!latest.current.settings) apply({ ...latest.current, settings: await bridge!.configureConversation!(initialSettings) });
    const message = await bridge!.sendMessage!(input);
    apply(mergeTarsMessage(latest.current, message));
    return message;
  }), [apply, bridge, mutate]);
  const configure = useCallback((settings: TarsConversationSettings) => mutate(async () => {
    const saved = await bridge!.configureConversation!(settings);
    apply({ ...latest.current, settings: saved });
    return saved;
  }), [apply, bridge, mutate]);
  const cancel = useCallback((messageId: string) => mutate(async () => {
    const message = latest.current.messages.find((item) => item.id === messageId);
    if (!message) throw new Error(i18n.t("shell:tars.conversation.failed"));
    const result = await bridge!.cancelMessage!({ messageId, expectedRevision: message.revision });
    apply(mergeTarsMessage(latest.current, result));
    return result;
  }), [apply, bridge, mutate]);
  /**
   * Answers a decision card. It shares the request queue but not the composer's
   * busy state, and a failure stays with its card: null tells the card to say so.
   */
  const answer = useCallback(async (input: TarsAnswerInput): Promise<TarsAnswerResult | null> => {
    if (!bridge?.answer) return null;
    try { return await queue.current(() => bridge.answer!(input)); }
    catch { return null; }
    finally { void refresh(); }
  }, [bridge, refresh]);
  useEffect(() => {
    mounted.current = true;
    // Subscribe before the first read so a change during it is not lost; there is no polling.
    const unsubscribe = bridge?.onChanged?.((event) => { if (event.scope === "conversation") void refresh(); });
    void refresh();
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      mounted.current = false;
      unsubscribe?.();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [bridge, refresh]);
  return { conversation, error, busy, available, refresh, send, configure, cancel, answer };
}
export type TarsConversationState = ReturnType<typeof useTarsConversation>;
