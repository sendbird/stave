import { i18n, useTranslation } from "@/i18n";
import { formatRelativeTime } from "@/i18n/format";
import { useEffect, useId, useMemo, useState } from "react";
import { Banner } from "@/components/ads/components/Banner";
import { useAsync } from "@/components/ads/utils/async";
import { sx } from "@/components/ads/utils/stylex";
import { AsyncBoundary } from "@/components/system/AsyncBoundary";
import { Button, Textarea, toast } from "@/components/ui";
import { readTaskHandoff } from "@/lib/db/task-handoff.db";
import {
  buildHandoffUpdateRequest,
  HANDOFF_SECTION_IDS,
  HANDOFF_SECTION_MAX_CHARS,
  handoffRecordToDraft,
  parseHandoffProposal,
  type HandoffDraft,
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
      if (editor.applySuggestions(suggestions) === 0) {
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
      {editor.isEditing ? (
        <HandoffDraftFields
          fieldId={fieldId}
          draft={editor.draft}
          reviewing={Object.values(editor.authors).some((author) => author !== "user")}
          onChange={editor.updateSection}
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
                        {describeAuthor(section.updatedBy, formatRelativeTime(section.updatedAt))}
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
          <Button size="sm" disabled={editor.saving || editor.conflict !== null} onClick={() => void save(editor.commit)}>
            {i18n.t("common:actions.save")}
          </Button>
        </div>
      ) : null}
    </>
  );
}

function HandoffDraftFields(props: {
  fieldId: string;
  draft: HandoffDraft;
  reviewing: boolean;
  onChange: (id: HandoffSectionId, text: string) => void;
}) {
  useTranslation();
  return (
    <div className={sx(styles.sections)}>
      {props.reviewing ? <p className={sx(styles.intro)}>{i18n.t("session:handoff.reviewing")}</p> : null}
      {HANDOFF_SECTION_IDS.map((id) => (
        <div key={id} className={sx(styles.section)}>
          <label htmlFor={`${props.fieldId}-${id}`} className={sx(styles.sectionTitle)}>
            {i18n.t(SECTION_TITLE_KEYS[id])}
          </label>
          <Textarea
            id={`${props.fieldId}-${id}`}
            value={props.draft[id]}
            maxLength={HANDOFF_SECTION_MAX_CHARS}
            placeholder={i18n.t(SECTION_HINT_KEYS[id])}
            onChange={(event) => props.onChange(id, event.target.value)}
            xstyle={styles.textarea}
          />
        </div>
      ))}
    </div>
  );
}
