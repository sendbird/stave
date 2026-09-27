import { useCallback, useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { ArrowUp, ArrowUpRight, Bot, X } from "lucide-react";
import { MessageResponse } from "@/components/ai-elements";
import { Button } from "@/components/ads/components/Button";
import { IconTile, iconTileGlyphSizes } from "@/components/ads/components/IconTile";
import { Textarea } from "@/components/ads/components/Textarea";
import { TextShimmer } from "@/components/ads/components/TextShimmer";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { loadTaskMessagesPage } from "@/lib/db/workspaces.db";
import type { ProjectDetail } from "@/lib/projects/api";
import { PROJECT_LIMITS } from "@/lib/projects/domain";
import { isStaveCoordinatorPrompt, summarizeStaveCoordinatorPrompt } from "@/lib/projects/policy";
import { getProviderLabel, toHumanModelName } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";

const MESSAGE_PAGE = 40;
/** While the coordinator answers, its transcript is re-read this often. */
const POLL_MS = 2_000;

export type CoordinatorMessageLoader = (args: { workspaceId: string; taskId: string }) => Promise<ChatMessage[]>;

async function loadSavedMessages(args: { workspaceId: string; taskId: string }) {
  const page = await loadTaskMessagesPage({ ...args, limit: MESSAGE_PAGE, preserveStreaming: true });
  return page.messages;
}

export interface DockEntry {
  id: string;
  author: "you" | "stave" | "coordinator";
  text: string;
  streaming: boolean;
}

/**
 * The coordinator's conversation as the dock shows it: what you wrote, what
 * Stave woke it with (first line only), and its answers — never tool calls.
 */
export function toDockEntries(messages: readonly ChatMessage[]): DockEntry[] {
  const entries: DockEntry[] = [];
  for (const message of messages) {
    const text = (message.displayContent ?? message.content ?? "").trim();
    if (!text && !message.isStreaming) continue;
    if (message.role === "user") {
      const stave = isStaveCoordinatorPrompt(text);
      entries.push({ id: message.id, author: stave ? "stave" : "you", text: stave ? summarizeStaveCoordinatorPrompt(text) : text, streaming: false });
    } else if (message.role === "assistant") {
      entries.push({ id: message.id, author: "coordinator", text, streaming: Boolean(message.isStreaming) });
    }
  }
  return entries;
}

/**
 * The coordinator's conversation beside the project: read what it said, and
 * write to it without leaving the project. Its turns stay read-only.
 */
export function CoordinatorDock(props: {
  detail: ProjectDetail;
  onSend: (text: string) => Promise<{ ok: boolean; message?: string }>;
  onOpenTask: () => void;
  /** Hides the conversation; floating on a narrow window, docked otherwise. */
  onClose?: () => void;
  /** Where the transcript comes from; the saved task messages by default. */
  loadMessages?: CoordinatorMessageLoader;
}) {
  const { project } = props.detail;
  const state = props.detail.coordinatorState;
  const busy = Boolean(state?.busy);
  const [entries, setEntries] = useState<DockEntry[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [followUntil, setFollowUntil] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const { workspaceId, taskId } = project.coordinator;

  const load = props.loadMessages ?? loadSavedMessages;
  // Reads can finish out of order (a slow one, then a poll); only a newer read
  // than the one on screen lands, and none after the dock is gone.
  const issued = useRef(0);
  const applied = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reload = useCallback(async () => {
    const sequence = ++issued.current;
    const messages = await load({ workspaceId, taskId }).catch(() => null);
    if (!mounted.current || sequence < applied.current) return;
    applied.current = sequence;
    if (messages) setEntries(toDockEntries(messages));
  }, [load, workspaceId, taskId]);

  // Re-read when the project changes (a wake, a message) and while it answers.
  // The events are the newest few, so their count stops changing; the last id does not.
  const lastEventId = props.detail.events.at(-1)?.id ?? null;
  useEffect(() => {
    void reload();
  }, [reload, lastEventId, busy]);
  useEffect(() => {
    const following = followUntil - Date.now();
    if (!busy && following <= 0) return;
    const timer = setInterval(() => void reload(), POLL_MS);
    // After a message, follow for a while even if the answer has not started; then stop.
    const stop = busy ? null : setTimeout(() => setFollowUntil(0), following);
    return () => {
      clearInterval(timer);
      if (stop) clearTimeout(stop);
    };
  }, [busy, followUntil, reload]);

  // Stay at the newest message.
  const last = entries?.at(-1);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [entries?.length, last?.text]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || busy) return;
    setSending(true);
    setFailure(null);
    const response = await props.onSend(text);
    setSending(false);
    if (!response.ok) {
      setFailure(response.message ?? "The message was not sent.");
      return;
    }
    setDraft("");
    setFollowUntil(Date.now() + 15_000);
    void reload();
  };

  const runsOn = state?.providerId
    ? `${getProviderLabel({ providerId: state.providerId as ProviderId })}${state.model ? ` · ${toHumanModelName({ model: state.model })}` : ""}`
    : null;
  const unavailable = state ? !state.available : false;
  const answering = busy && last?.author !== "coordinator";

  return (
    <aside className={sx(styles.dock)} aria-label="Coordinator conversation">
      <header className={sx(styles.header)}>
        <IconTile size="xs" tone="accent">
          <Bot size={iconTileGlyphSizes.xs} />
        </IconTile>
        <span className={sx(styles.headerText)}>
          <span className={sx(styles.title)}>Coordinator</span>
          <span className={sx(styles.meta)}>
            <span className={sx(styles.dot, busy ? styles.dotBusy : styles.dotIdle)} aria-hidden />
            {busy ? "Answering" : unavailable ? "Unavailable" : "Idle"}
            {runsOn ? ` · ${runsOn}` : ""}
          </span>
        </span>
        <Tooltip content="Open the coordinator's task">
          <Button variant="quiet" size="xs" iconOnly aria-label="Open the coordinator's task" onClick={props.onOpenTask}>
            <ArrowUpRight aria-hidden />
          </Button>
        </Tooltip>
        {props.onClose ? (
          <Button variant="quiet" size="xs" iconOnly aria-label="Close the conversation" onClick={props.onClose}>
            <X aria-hidden />
          </Button>
        ) : null}
      </header>

      <div ref={scroller} className={sx(styles.scroll)} aria-live="polite">
        {entries === null ? null : entries.length === 0 ? (
          <p className={sx(styles.empty)}>
            The coordinator plans the missions and follows them. Ask it to split work, change course or explain a
            decision — it edits no files.
          </p>
        ) : (
          entries.map((entry) =>
            entry.author === "stave" ? (
              <p key={entry.id} className={sx(styles.system)}>
                <span className={sx(styles.systemLabel)}>Stave</span> {entry.text}
              </p>
            ) : entry.author === "you" ? (
              <div key={entry.id} className={sx(styles.mine)}>
                <p className={sx(styles.bubble)}>{entry.text}</p>
              </div>
            ) : (
              <div key={entry.id} className={sx(styles.theirs)}>
                <MessageResponse isStreaming={entry.streaming}>{entry.text}</MessageResponse>
              </div>
            ),
          )
        )}
        {answering ? (
          <span className={sx(styles.answering)}>
            <TextShimmer>Thinking about the project…</TextShimmer>
          </span>
        ) : null}
      </div>

      <form
        className={sx(styles.composer)}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <span className={sx(styles.input)}>
          <Textarea
          aria-label="Message the coordinator"
          size="sm"
          autoResize
          maxRows={6}
          rows={1}
          value={draft}
          maxLength={PROJECT_LIMITS.coordinatorMessage}
          disabled={unavailable}
          placeholder={busy ? "The coordinator is answering…" : "Message the coordinator"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
          />
        </span>
        <Button
          type="submit"
          size="sm"
          iconOnly
          aria-label="Send to the coordinator"
          disabled={!draft.trim() || busy || sending || unavailable}
          loading={sending}
        >
          <ArrowUp aria-hidden />
        </Button>
      </form>
      {failure ? (
        <p className={sx(styles.failure)} role="alert">
          {failure}
        </p>
      ) : null}
    </aside>
  );
}

const styles = stylex.create({
  dock: {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    height: "100%",
    backgroundColor: vars["--ads-color-surface"],
    borderInlineStartWidth: vars["--ads-border-width-hairline"],
    borderInlineStartStyle: "solid",
    borderInlineStartColor: vars["--ads-color-border-subtle"],
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    minHeight: 52,
    paddingInline: vars["--ads-space-12"],
    borderBottomWidth: vars["--ads-border-width-hairline"],
    borderBottomStyle: "solid",
    borderBottomColor: vars["--ads-color-border-subtle"],
  },
  headerText: { display: "flex", flexDirection: "column", flex: "1 1 auto", minWidth: 0 },
  title: { fontSize: vars["--ads-font-size-body"], fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-text"] },
  meta: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  dot: { flex: "0 0 auto", width: 6, height: 6, borderRadius: vars["--ads-radius-full"] },
  dotBusy: { backgroundColor: vars["--ads-color-accent"] },
  dotIdle: { backgroundColor: vars["--ads-color-border-strong"] },
  scroll: {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    padding: vars["--ads-space-16"],
  },
  empty: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-muted"],
  },
  system: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text-subtle"],
    overflowWrap: "anywhere",
  },
  systemLabel: { fontWeight: vars["--ads-font-weight-medium"], color: vars["--ads-color-text-muted"] },
  mine: { display: "flex", justifyContent: "flex-end" },
  bubble: {
    margin: 0,
    maxWidth: "85%",
    paddingBlock: vars["--ads-space-8"],
    paddingInline: vars["--ads-space-12"],
    borderRadius: vars["--ads-radius-panel"],
    backgroundColor: vars["--ads-color-canvas-subtle"],
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text"],
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  theirs: { minWidth: 0, fontSize: vars["--ads-font-size-body"] },
  answering: { fontSize: vars["--ads-font-size-caption"] },
  input: { flex: "1 1 auto", minWidth: 0 },
  composer: {
    display: "flex",
    alignItems: "flex-end",
    gap: vars["--ads-space-8"],
    padding: vars["--ads-space-12"],
    borderTopWidth: vars["--ads-border-width-hairline"],
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
  },
  failure: {
    margin: 0,
    paddingInline: vars["--ads-space-12"],
    paddingBottom: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-danger-text"],
  },
});
