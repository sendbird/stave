import { useMemo, useState, type ReactNode } from "react";
import { i18n, useTranslation } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import { Accordion } from "@/components/aui/components/Accordion";
import { Badge, Button } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { MemoryRow } from "@/components/layout/WorkspaceMemorySection";
import { REPOSITORY_MEMORY_INJECTION_MAX_ITEMS, type RepositoryMemory, type RepositoryMemorySourceTask } from "@/lib/repository-memory";
import {
  TARS_PLANNER_HISTORY_MESSAGES, TARS_PLANNER_MAX_REPOSITORIES, buildTarsKnowledge, groupTarsRepositoryMemories,
  type TarsKnowledgeRepository, type TarsKnowledgeSource,
} from "@/lib/tars/knowledge";
import type { TarsConversationSettings } from "@/lib/tars/conversation";
import type { TarsIdentity } from "@/lib/tars/types";
import { tarsInsightsStyles as styles } from "./tars-insights.styles";
import { useTarsRepositoryMemories, type TarsRepositoryMemoriesState } from "./use-tars-insights";

/** Memories listed per group before "Show more"; the rest are one press away. */
const MEMORIES_SHOWN = 8;

const SOURCE_KEYS = {
  you: "shell:tars.knows.source.you",
  default: "shell:tars.knows.source.default",
  none: "shell:tars.knows.source.none",
} as const satisfies Record<TarsKnowledgeSource, string>;

export interface TarsKnowsRepositoryInput {
  repositoryPath: string;
  repositoryName: string;
  kickoffBranchNamingRule?: string | null;
}

/** One thing Tars knows: its name, where the value comes from, the value, and the existing editor that changes it. */
function KnownItem({ title, meta, edit, children, kind }: { title: string; meta?: ReactNode; edit?: { label: string; onEdit: () => void }; children: ReactNode; kind: string }) {
  const { t } = useTranslation(["shell"]);
  return <div className={sx(styles.item)} data-tars-knows-item={kind}>
    <div className={sx(styles.itemHead)}>
      <h4 className={sx(styles.itemTitle)}>{title}</h4>
      {edit ? <Button type="button" variant="ghost" size="2xs" aria-label={edit.label} title={edit.label} data-tars-knows-edit={kind} onClick={edit.onEdit}>{t("shell:tars.knows.edit")}</Button> : null}
    </div>
    {meta ? <p className={sx(styles.meta)}>{meta}</p> : null}
    {children}
  </div>;
}

function MemoryGroup({ memories, sourceTasks, now, onSave, onRemove, onOpenTask }: {
  memories: readonly RepositoryMemory[]; sourceTasks: ReadonlyMap<string, RepositoryMemorySourceTask>; now: Date;
  onSave: Parameters<typeof MemoryRow>[0]["onSave"]; onRemove: (memory: RepositoryMemory) => Promise<boolean>;
  onOpenTask?: (task: RepositoryMemorySourceTask) => void;
}) {
  const { t } = useTranslation(["shell"]);
  const [all, setAll] = useState(false);
  const shown = all ? memories : memories.slice(0, MEMORIES_SHOWN);
  const more = memories.length - shown.length;
  return <>
    <div className={sx(styles.memoryList)}>
      {shown.map((memory) => <MemoryRow key={memory.id} memory={memory} now={now} sourceTask={memory.sourceTaskId ? sourceTasks.get(memory.sourceTaskId) : undefined}
        onOpenSourceTask={onOpenTask} onSave={onSave} onRemove={() => onRemove(memory)} />)}
    </div>
    {more > 0 ? <div><Button type="button" variant="ghost" size="2xs" onClick={() => setAll(true)}>{t("shell:tars.knows.memory.showMore", { count: more })}</Button></div> : null}
  </>;
}

/** A repository's memories as read: what its tasks can receive, then what they cannot yet, each on the Memory panel's own row. */
export function TarsRepositoryMemoryPanel({ state, onReload, onSave, onRemove, onOpenTask }: {
  state: TarsRepositoryMemoriesState; onReload: () => void;
  onSave: Parameters<typeof MemoryRow>[0]["onSave"]; onRemove: (memory: RepositoryMemory) => Promise<boolean>;
  onOpenTask?: (task: RepositoryMemorySourceTask) => void;
}) {
  const { t } = useTranslation(["shell", "common"]);
  const readAt = state.status === "ready" ? state.readAt : 0;
  const now = useMemo(() => new Date(readAt), [readAt]);
  const groups = useMemo(() => state.status === "ready" ? groupTarsRepositoryMemories(state.items, state.readAt) : null, [state]);
  return <div className={sx(styles.item)} data-tars-knows-item="memory" data-tars-knows-memory={state.status}>
    <h4 className={sx(styles.itemTitle)}>{t("shell:tars.knows.memory.title")}</h4>
    <p className={sx(styles.note)}>{t("shell:tars.knows.memory.use", { max: REPOSITORY_MEMORY_INJECTION_MAX_ITEMS })}</p>
    {state.status === "idle" || state.status === "loading" ? <p className={sx(styles.note)} role="status">{t("shell:tars.knows.memory.loading")}</p> : null}
    {state.status === "unavailable" ? <p className={sx(styles.note)}>{t("shell:tars.knows.memory.unavailable")}</p> : null}
    {state.status === "failed" ? <p role="alert" className={sx(styles.note, styles.error)}>{t("shell:tars.knows.memory.loadFailed")}{" "}
      <Button type="button" variant="ghost" size="2xs" onClick={onReload}>{t("common:actions.retry")}</Button></p> : null}
    {state.status === "ready" && groups ? <>
      {!state.useMemory ? <p className={sx(styles.note)} data-tars-knows-memory-off="">{t("shell:tars.knows.memory.off")}</p> : null}
      {!state.items.length ? <p className={sx(styles.note)}>{t("shell:tars.knows.memory.empty")}</p> : <p className={sx(styles.note)}>{t("shell:tars.knows.memory.editHint")}</p>}
      {groups.used.length ? <>
        <h5 className={sx(styles.subhead)}>{t("shell:tars.knows.memory.used", { count: groups.used.length })}</h5>
        <MemoryGroup memories={groups.used} sourceTasks={state.sourceTasks} now={now} onSave={onSave} onRemove={onRemove} onOpenTask={onOpenTask} />
      </> : null}
      {groups.unused.length ? <>
        <h5 className={sx(styles.subhead)}>{t("shell:tars.knows.memory.unused")}</h5>
        <p className={sx(styles.note)}>{t("shell:tars.knows.memory.unusedHint")}</p>
        <MemoryGroup memories={groups.unused} sourceTasks={state.sourceTasks} now={now} onSave={onSave} onRemove={onRemove} onOpenTask={onOpenTask} />
      </> : null}
    </> : null}
  </div>;
}

/** Reads a repository's memories when its section first opens (the accordion mounts it then). */
function RepositoryMemories({ repositoryPath, onOpenTask }: { repositoryPath: string; onOpenTask?: (task: RepositoryMemorySourceTask, repositoryPath: string) => void }) {
  const { state, reload, save, remove } = useTarsRepositoryMemories(repositoryPath, true);
  return <TarsRepositoryMemoryPanel state={state} onReload={() => void reload()} onSave={save} onRemove={remove}
    onOpenTask={onOpenTask ? (task) => onOpenTask(task, repositoryPath) : undefined} />;
}

/** What applies only in one repository: its branch naming rule, then its memories (`memory`). */
export function TarsRepositoryKnowledge({ repository, onEditRepository, memory }: {
  repository: TarsKnowledgeRepository; onEditRepository?: (repositoryPath: string) => void; memory: ReactNode;
}) {
  const { t } = useTranslation(["shell"]);
  const rule = repository.branchRule;
  return <div className={sx(styles.repositoryBody)}>
    <KnownItem kind="branchRule" title={t("shell:tars.knows.branchRule.title")}
      meta={<span>{t(rule.source === "you" ? "shell:tars.knows.source.repository" : "shell:tars.knows.source.default")}</span>}
      edit={onEditRepository ? { label: t("shell:tars.knows.branchRule.edit", { name: repository.name }), onEdit: () => onEditRepository(repository.repositoryPath) } : undefined}>
      <p className={sx(styles.quoted)}>{rule.text}</p>
      <p className={sx(styles.note)}>{t("shell:tars.knows.branchRule.use")}</p>
    </KnownItem>
    {memory}
  </div>;
}

/**
 * What Tars carries between messages, grouped by where it applies, each part
 * with its source and the existing editor that changes it. Read-only itself:
 * instructions and agents are edited in Tars settings, the branch rule in
 * repository settings, and a memory on its own row (the Memory panel's row).
 */
export function TarsKnowsView({ identity, settings, agentNameOf, repositories, onEditSettings, onEditRepository, onOpenTask }: {
  identity: Pick<TarsIdentity, "instructions" | "updatedAt">;
  settings: Pick<TarsConversationSettings, "allowedAgentIds"> | null;
  agentNameOf: (id: string) => string | null;
  repositories: readonly TarsKnowsRepositoryInput[];
  onEditSettings: () => void;
  /** Opens repository settings; absent where they cannot be opened, which then shows the rule read-only. */
  onEditRepository?: (repositoryPath: string) => void;
  onOpenTask?: (task: RepositoryMemorySourceTask, repositoryPath: string) => void;
}) {
  const { t } = useTranslation(["shell"]);
  const knowledge = useMemo(() => buildTarsKnowledge({ identity, settings, agentNameOf, repositories,
    // The default in either language reads as Stave's, whichever one the interface shows now.
    defaults: ["en", "ko"].map((lng) => i18n.t("shell:tars.instructionsDefault", { lng })) }), [agentNameOf, identity, repositories, settings]);
  const { instructions, agents } = knowledge.everywhere;
  return <div className={sx(styles.body)} data-testid="tars-knows-view">
    <section className={sx(styles.section)} data-tars-knows-scope="everywhere">
      <div className={sx(styles.sectionHead)}>
        <h3 className={sx(styles.sectionTitle)}>{t("shell:tars.knows.everywhere.title")}</h3>
        <p className={sx(styles.note)}>{t("shell:tars.knows.everywhere.hint")}</p>
      </div>
      <KnownItem kind="instructions" title={t("shell:tars.knows.instructions.title")}
        meta={<><span data-tars-knows-source={instructions.source}>{t(SOURCE_KEYS[instructions.source])}</span><span aria-hidden>·</span>
          <span>{instructions.changedAt ? t("shell:tars.knows.savedAt", { time: formatDateTime(instructions.changedAt) }) : t("shell:tars.knows.neverSaved")}</span></>}
        edit={{ label: t("shell:tars.knows.instructions.edit"), onEdit: onEditSettings }}>
        {instructions.text ? <p className={sx(styles.quoted)} tabIndex={0}>{instructions.text}</p> : <p className={sx(styles.note)}>{t("shell:tars.knows.instructions.empty")}</p>}
        <p className={sx(styles.note)}>{t("shell:tars.knows.instructions.use")}</p>
      </KnownItem>
      <KnownItem kind="agents" title={t("shell:tars.knows.agents.title")}
        meta={agents.source === "you" ? <span data-tars-knows-source="you">{t("shell:tars.knows.source.tarsSettings")}</span> : undefined}
        edit={{ label: t("shell:tars.knows.agents.edit"), onEdit: onEditSettings }}>
        {agents.allowed.length ? <ul className={sx(styles.chips)}>{agents.allowed.map((agent) => <li key={agent.id}><Badge variant="secondary">{agent.name}</Badge></li>)}</ul>
          : <p className={sx(styles.note)}>{t("shell:tars.knows.agents.none")}</p>}
        {agents.missing.length ? <p className={sx(styles.note)}>{t("shell:tars.knows.agents.missing", { count: agents.missing.length })}</p> : null}
        <p className={sx(styles.note)}>{t("shell:tars.knows.agents.builtins")}</p>
      </KnownItem>
    </section>
    <section className={sx(styles.section)} data-tars-knows-scope="repositories">
      <div className={sx(styles.sectionHead)}>
        <h3 className={sx(styles.sectionTitle)}>{t("shell:tars.knows.repositories.title")}</h3>
        <p className={sx(styles.note)}>{t("shell:tars.knows.repositories.hint")}</p>
      </div>
      {knowledge.repositories.length ? <Accordion multiple mount="lazy" items={knowledge.repositories.map((repository) => ({
        value: repository.repositoryPath,
        title: <span className={sx(styles.repositoryTitle)}><span className={sx(styles.repositoryName)}>{repository.name}</span>
          <span className={sx(styles.repositoryPath)}>{repository.repositoryPath}</span></span>,
        content: <TarsRepositoryKnowledge repository={repository} onEditRepository={onEditRepository}
          memory={<RepositoryMemories repositoryPath={repository.repositoryPath} onOpenTask={onOpenTask} />} />,
      }))} /> : <p className={sx(styles.note)}>{t("shell:tars.knows.repositories.empty")}</p>}
      {knowledge.omittedRepositories ? <p className={sx(styles.note)}>{t("shell:tars.knows.repositories.omitted", { count: knowledge.omittedRepositories, max: TARS_PLANNER_MAX_REPOSITORIES })}</p> : null}
    </section>
    <section className={sx(styles.section)} data-tars-knows-scope="forgets">
      <h3 className={sx(styles.sectionTitle)}>{t("shell:tars.knows.forgets.title")}</h3>
      <p className={sx(styles.note)}>{t("shell:tars.knows.forgets.body", { count: TARS_PLANNER_HISTORY_MESSAGES })}</p>
    </section>
  </div>;
}
