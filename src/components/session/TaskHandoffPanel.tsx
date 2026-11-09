import { i18n, useTranslation } from "@/i18n";
import { formatList, formatNumber, formatTimeAgo } from "@/i18n/format";
import { useEffect, useId, useMemo, useState } from "react";
import { CircleAlert } from "lucide-react";
import { Banner } from "@/components/aui/components/Banner";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { useAsync } from "@/components/aui/utils/async";
import { sx } from "@/components/aui/utils/stylex";
import { AsyncBoundary } from "@/components/system/AsyncBoundary";
import { Button, Textarea, toast } from "@/components/ui";
import { readTaskHandoff } from "@/lib/db/task-handoff.db";
import {
  buildHandoffUpdateRequest,
  HANDOFF_SECTION_IDS,
  HANDOFF_SECTION_MAX_CHARS,
  handoffRecordToDraft,
  handoffSectionOverflow,
  parseHandoffProposal,
  type HandoffDraft,
  type HandoffLeftOut,
  type HandoffSectionId,
  type TaskHandoffRecord,
} from "@/lib/task-context/handoff-record";
import { useAppStore } from "@/store/app.store";
import { taskHandoffKey, useTaskHandoffStore } from "@/store/task-handoff-store";
import type { ChatMessage } from "@/types/chat";
import { collectHandoffSuggestions } from "./handoff-facts";
import { handoffStyles as styles } from "./task-handoff-panel.styles";
import { useHandoffEditor } from "./use-handoff-editor";

const NO_MESSAGES: ChatMessage[] = [];
const NO_PATHS: string[] = [];
/** Proposals the user dismissed this session, by the message that made them. */
const dismissedProposalIds = new Set<string>();

const SECTION_TITLE_KEYS = {
  goal: "session:handoff.sections.goal",
  decisions: "session:handoff.sections.decisions",
  verified: "session:handoff.sections.verified",
  remaining: "session:handoff.sections.remaining",
  cautions: "session:handoff.sections.cautions",
} as const;
const SECTION_HINT_KEYS = {
  goal: "session:handoff.hints.goal",
  decisions: "session:handoff.hints.decisions",
  verified: "session:handoff.hints.verified",
  remaining: "session:handoff.hints.remaining",
  cautions: "session:handoff.hints.cautions",
} as const;

/**
 * The newest finished reply in the task that proposes a record, unless the
 * record already says what it proposes or the user dismissed it.
 */
export function findHandoffProposal(messages: readonly ChatMessage[], record: TaskHandoffRecord) {
  const current = handoffRecordToDraft(record);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant" || message.isStreaming) continue;
    const proposal = parseHandoffProposal(message.content);
    if (!proposal) continue;
    const differs = HANDOFF_SECTION_IDS.some((id) => proposal[id] !== undefined && proposal[id] !== current[id]);
    return differs && !dismissedProposalIds.has(message.id) ? { messageId: message.id, proposal } : null;
  }
  return null;
}

/**
 * The Task panel's Handoff tab: the task's record of its goal, approved
 * decisions, verified results, remaining work and cautions, kept for whoever
 * picks the task up next, a person or a provider.
 */
export function TaskHandoffPanel(props: { workspaceId: string; taskId: string }) {
  useTranslation();
  const { workspaceId, taskId } = props;
  const key = taskHandoffKey(workspaceId, taskId);
  const put = useTaskHandoffStore((state) => state.put);
  const stored = useTaskHandoffStore((state) => state.records[key]);
  const { state, refresh } = useAsync(() => readTaskHandoff({ workspaceId, taskId }), [workspaceId, taskId]);
  useEffect(() => {
    if (state.status === "ready") put(key, state.data);
  }, [key, put, state]);
  return (
    <div className={sx(styles.root)} data-testid="task-handoff">
      <AsyncBoundary
        state={state}
        onRetry={refresh}
        describeError={() => i18n.t("session:handoff.readFailed")}
      >
        {(record) => (
          <TaskHandoffEditor
            draftKey={key}
            workspaceId={workspaceId}
            taskId={taskId}
            record={stored ?? record}
            onSaved={(next) => put(key, next)}
          />
        )}
      </AsyncBoundary>
    </div>
  );
}

/** What Fill could not add because a section would pass its limit, or null when everything fit. */
export function describeHandoffLeftOut(leftOut: HandoffLeftOut) {
  const sections = HANDOFF_SECTION_IDS.filter((id) => (leftOut[id]?.length ?? 0) > 0);
  if (sections.length === 0) return null;
  return i18n.t("session:handoff.fillLeftOut", {
    count: sections.reduce((total, id) => total + (leftOut[id]?.length ?? 0), 0),
    sections: formatList(sections.map((id) => i18n.t(SECTION_TITLE_KEYS[id]))),
    limit: formatNumber(HANDOFF_SECTION_MAX_CHARS),
  });
}

function describeAuthor(updatedBy: "user" | "agent" | "stave", time: string) {
  if (updatedBy === "agent") return i18n.t("session:handoff.updatedByAgent", { time });
  if (updatedBy === "stave") return i18n.t("session:handoff.updatedByStave", { time });
  return i18n.t("session:handoff.updatedByUser", { time });
}

export function TaskHandoffEditor(props: {
  draftKey: string;
  workspaceId: string;
  taskId: string;
  record: TaskHandoffRecord;
  onSaved: (record: TaskHandoffRecord) => void;
}) {
  useTranslation();
  const { record, taskId } = props;
  const editor = useHandoffEditor(props);
  const messages = useAppStore((state) => state.messagesByTask[taskId] ?? NO_MESSAGES);
  const planFilePaths = useAppStore(
    (state) => state.tasks.find((task) => task.id === taskId)?.planFilePaths ?? NO_PATHS,
  );
  const turnRunning = useAppStore((state) => Boolean(state.activeTurnIdsByTask[taskId]));
  const sendUserMessage = useAppStore((state) => state.sendUserMessage);
  const [dismissTick, setDismissTick] = useState(0);
  const [filling, setFilling] = useState(false);
  const proposal = useMemo(
    () => findHandoffProposal(messages, record),
    // A dismissal changes the module-level set, not the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, record, dismissTick],
  );
  const fieldId = useId();

  const askAgent = async () => {
    const result = await sendUserMessage({
      taskId,
      content: buildHandoffUpdateRequest(record),
      preservePromptDraft: true,
      turnOrigin: "conversation",
    });
    if (result.status === "started" || result.status === "queued") {
      toast.success(i18n.t("session:handoff.askSent"));
    } else {
      toast.error(i18n.t("session:handoff.askFailed"));
    }
  };

  const fill = async () => {
    setFilling(true);
    try {
      const suggestions = await collectHandoffSuggestions({
        workspaceId: props.workspaceId,
        taskId,
        messages,
        planFilePaths,
      });
      const result = editor.applySuggestions(suggestions);
      const leftOut = describeHandoffLeftOut(result.leftOut);
      if (leftOut) {
        toast.warning(leftOut);
      } else if (result.changed.length === 0) {
        toast.info(i18n.t("session:handoff.fillNothing"));
      }
    } finally {
      setFilling(false);
    }
  };

  const save = async (action: () => Promise<string>) => {
    const outcome = await action();
    if (outcome === "saved") toast.success(i18n.t("session:handoff.saved"));
    else if (outcome === "failed") toast.error(i18n.t("session:handoff.saveFailed"));
  };

  return (
    <>
      <p className={sx(styles.intro)}>{i18n.t("session:handoff.intro")}</p>
      {proposal && !editor.isEditing ? (
        <Banner
          tone="info"
          title={i18n.t("session:handoff.proposalTitle")}
          action={
            <div className={sx(styles.actions)}>
              <Button size="sm" variant="outline" onClick={() => editor.applyProposal(proposal.proposal)}>
                {i18n.t("session:handoff.review")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  dismissedProposalIds.add(proposal.messageId);
                  setDismissTick((tick) => tick + 1);
                }}
              >
                {i18n.t("session:handoff.dismiss")}
              </Button>
            </div>
          }
        >
          {i18n.t("session:handoff.proposalDetail")}
        </Banner>
      ) : null}
      {!editor.isEditing ? (
        <div className={sx(styles.actions)}>
          <Button size="sm" variant="outline" onClick={editor.startEditing}>
            {i18n.t("session:handoff.edit")}
          </Button>
          <Button size="sm" variant="outline" disabled={filling} onClick={() => void fill()}>
            {i18n.t("session:handoff.fill")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={turnRunning}
            title={turnRunning ? i18n.t("session:handoff.askBusy") : undefined}
            onClick={() => void askAgent()}
          >
            {i18n.t("session:handoff.ask")}
          </Button>
        </div>
      ) : null}
      {editor.isEditing ? (
        <HandoffDraftFields
          fieldId={fieldId}
          draft={editor.draft}
          reviewing={Object.values(editor.authors).some((author) => author !== "user")}
          leftOut={editor.leftOut}
          onChange={editor.updateSection}
          onPutBack={editor.putBack}
        />
      ) : (
        <dl className={sx(styles.sections)}>
          {HANDOFF_SECTION_IDS.map((id) => {
            const section = record.sections[id];
            return (
              <div key={id} className={sx(styles.section)} data-handoff-section={id}>
                <dt className={sx(styles.sectionTitle)}>{i18n.t(SECTION_TITLE_KEYS[id])}</dt>
                <dd className={sx(styles.section)}>
                  {section?.text ? (
                    <>
                      <p className={sx(styles.sectionText)}>{section.text}</p>
                      <p className={sx(styles.sectionMeta)} title={section.updatedAt}>
                        {describeAuthor(section.updatedBy, formatTimeAgo(section.updatedAt))}
                      </p>
                    </>
                  ) : (
                    <p className={sx(styles.sectionEmpty)}>{i18n.t("session:handoff.empty")}</p>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {editor.isEditing && editor.conflict ? (
        <Banner
          tone="warning"
          title={i18n.t("session:handoff.conflictTitle")}
          action={
            <div className={sx(styles.actions)}>
              <Button size="sm" variant="ghost" onClick={editor.cancel}>
                {i18n.t("session:handoff.discardMine")}
              </Button>
              <Button size="sm" disabled={editor.saving} onClick={() => void save(editor.overwrite)}>
                {i18n.t("session:handoff.saveMine")}
              </Button>
            </div>
          }
        >
          {i18n.t("session:handoff.conflictDetail")}
        </Banner>
      ) : null}
      {editor.isEditing ? (
        <div className={sx(styles.footer)}>
          <Button size="sm" variant="ghost" onClick={editor.cancel}>
            {i18n.t("common:actions.cancel")}
          </Button>
          <Button size="sm" disabled={editor.saving || editor.conflict !== null || editor.overLimit} onClick={() => void save(editor.commit)}>
            {i18n.t("common:actions.save")}
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** The editor's fields, each with what Fill left out of it and how far past its limit it is. */
export function HandoffDraftFields(props: {
  fieldId: string;
  draft: HandoffDraft;
  reviewing: boolean;
  leftOut: HandoffLeftOut;
  onChange: (id: HandoffSectionId, text: string) => void;
  onPutBack: (id: HandoffSectionId, line: string) => void;
}) {
  useTranslation();
  return (
    <div className={sx(styles.sections)}>
      {props.reviewing ? <p className={sx(styles.intro)}>{i18n.t("session:handoff.reviewing")}</p> : null}
      {HANDOFF_SECTION_IDS.map((id) => {
        const fieldId = `${props.fieldId}-${id}`;
        const overflow = handoffSectionOverflow(props.draft[id]);
        const lines = props.leftOut[id] ?? [];
        return (
          <div key={id} className={sx(styles.section)}>
            <label htmlFor={fieldId} className={sx(styles.sectionTitle)}>
              {i18n.t(SECTION_TITLE_KEYS[id])}
            </label>
            <Textarea
              id={fieldId}
              value={props.draft[id]}
              maxLength={HANDOFF_SECTION_MAX_CHARS}
              placeholder={i18n.t(SECTION_HINT_KEYS[id])}
              aria-invalid={overflow > 0 || undefined}
              aria-describedby={overflow > 0 ? `${fieldId}-over` : undefined}
              onChange={(event) => props.onChange(id, event.target.value)}
              xstyle={styles.textarea}
            />
            {overflow > 0 ? (
              <p id={`${fieldId}-over`} className={sx(styles.overLimit)}>
                {i18n.t("session:handoff.overLimit", { count: overflow, limit: formatNumber(HANDOFF_SECTION_MAX_CHARS) })}
              </p>
            ) : null}
            {lines.length > 0 ? (
              <HandoffLeftOutLines id={id} fieldId={fieldId} lines={lines} onPutBack={(line) => props.onPutBack(id, line)} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The lines Fill could not fit in a section, struck through and labelled so
 * the strike is never the only cue, each with Put back. A put-back line may
 * take the section past its limit; the field then says by how much.
 */
function HandoffLeftOutLines(props: { id: HandoffSectionId; fieldId: string; lines: readonly string[]; onPutBack: (line: string) => void }) {
  useTranslation();
  const headingId = `${props.fieldId}-left-out`;
  return (
    <div className={sx(styles.leftOut)} role="group" aria-labelledby={headingId} data-handoff-left-out={props.id}>
      <p id={headingId} className={sx(styles.leftOutHead)}>
        <CircleAlert aria-hidden className={sx(styles.leftOutIcon)} />
        <span className={sx(styles.leftOutTitle)}>{i18n.t("session:handoff.leftOutTitle", { count: props.lines.length })}</span>
        <span aria-hidden className={sx(styles.leftOutSeparator)}>·</span>
        <span className={sx(styles.leftOutLimit)}>
          {i18n.t("session:handoff.leftOutLimit", {
            section: i18n.t(SECTION_TITLE_KEYS[props.id]),
            limit: formatNumber(HANDOFF_SECTION_MAX_CHARS),
          })}
        </span>
      </p>
      <ul className={sx(styles.leftOutList)}>
        {props.lines.map((line, index) => {
          const lineId = `${props.fieldId}-left-out-${index}`;
          return (
            <li key={line} className={sx(styles.leftOutRow)}>
              <span id={lineId} className={sx(styles.leftOutText)} title={line}>
                <VisuallyHidden>{`${i18n.t("session:handoff.leftOutLabel")} `}</VisuallyHidden>
                <s>{line}</s>
              </span>
              <Button size="xs" variant="ghost" aria-describedby={lineId} onClick={() => props.onPutBack(line)} xstyle={styles.leftOutAction}>
                {i18n.t("session:handoff.putBack")}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
