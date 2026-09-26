import { useEffect, useMemo, useState } from "react";
import { BookOpen, Hand, Plus, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { DropdownMenu } from "@/components/ads/components/DropdownMenu";
import { Select } from "@/components/ads/components/Select";
import { TextField } from "@/components/ads/components/TextField";
import { sx } from "@/components/ads/utils/stylex";
import {
  createBlankPlaybook,
  duplicatePlaybook,
  removePlaybook,
  stageAsksFirst,
  upsertPlaybook,
} from "@/lib/playbooks/library";
import { CHECK_IN_LABELS, type Playbook } from "@/lib/playbooks/schema";
import { isCustomCheckIns, listSignOffStageIndexes } from "@/lib/playbooks/sign-off";
import { createPlaybookFromStarter, PLAYBOOK_STARTERS, type PlaybookStarter } from "@/lib/playbooks/starters";
import { useAppStore } from "@/store/app.store";
import { usePlaybooksUiStore } from "@/store/playbooks-ui-store";
import { PlaybookEditor } from "./PlaybookEditor";
import { playbookStyles as styles } from "./playbooks.styles";

const MISSION_PROVIDERS = new Set(["claude-code", "codex"]);

function describeCard(playbook: Playbook): string {
  const asks = listSignOffStageIndexes(playbook).length;
  const checkIns = isCustomCheckIns(playbook) ? "Custom check-ins" : CHECK_IN_LABELS[playbook.checkIns];
  return `${playbook.stages.length} stages · ${asks ? `${asks} sign-off${asks === 1 ? "" : "s"}` : checkIns}`;
}

/** The stage names as small chips, a hand on those that ask first. */
export function StageChips(props: { playbook: Pick<Playbook, "stages" | "checkIns">; limit?: number }) {
  const limit = props.limit ?? 8;
  const shown = props.playbook.stages.slice(0, limit);
  return (
    <span className={sx(styles.chips)}>
      {shown.map((stage, index) => (
        <span key={stage.id} className={sx(styles.chip)}>
          {stage.kind === "action" ? <Zap aria-hidden className={sx(styles.chipIcon)} /> : null}
          {stage.title}
          {stageAsksFirst(props.playbook, index) ? (
            <Hand aria-label="asks you first" className={sx(styles.chipIcon)} />
          ) : null}
        </span>
      ))}
      {props.playbook.stages.length > limit ? (
        <span className={sx(styles.chip)}>+{props.playbook.stages.length - limit}</span>
      ) : null}
    </span>
  );
}

function TemplateGallery(props: { onUse: (starter: PlaybookStarter) => void }) {
  return (
    <div className={sx(styles.templates)}>
      {PLAYBOOK_STARTERS.map((starter) => (
        <Button
          key={starter.id}
          layout="host"
          variant="quiet"
          press="none"
          xstyle={styles.template}
          onClick={() => props.onUse(starter)}
        >
          <span className={sx(styles.templateTitle)}>{starter.template.name}</span>
          <span className={sx(styles.templateText)}>{starter.description}</span>
          <StageChips playbook={starter.template} limit={6} />
        </Button>
      ))}
    </div>
  );
}

/**
 * The Playbooks tab of the Automations center: saved ways of working on the
 * left, the one being edited on the right. Unsaved edits stay with their
 * playbook while you look at another one.
 */
export function PlaybooksTab() {
  const saved = useAppStore((state) => state.settings.playbooks);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const activeProvider = useAppStore(
    (state) => state.tasks.find((task) => task.id === state.activeTaskId)?.provider ?? null,
  );
  const openStartSheet = usePlaybooksUiStore((state) => state.openStartSheet);
  const centerRequest = usePlaybooksUiStore((state) => state.centerRequest);
  const consumeCenterRequest = usePlaybooksUiStore((state) => state.consumeCenterRequest);

  const [drafts, setDrafts] = useState<Record<string, Playbook>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draftingId, setDraftingId] = useState<string | null>(null);

  // "Manage playbooks" and "Edit playbook" elsewhere land here.
  useEffect(() => {
    if (!centerRequest) return;
    if (centerRequest.playbookId) setSelectedId(centerRequest.playbookId);
    consumeCenterRequest();
  }, [centerRequest, consumeCenterRequest]);

  const unsavedNew = useMemo(
    () => Object.values(drafts).filter((draft) => !saved.some((playbook) => playbook.id === draft.id)),
    [drafts, saved],
  );
  const all = useMemo(() => [...saved, ...unsavedNew], [saved, unsavedNew]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((playbook) =>
      [playbook.name, playbook.purpose, playbook.shortcut ?? "", ...playbook.stages.map((stage) => stage.title)]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [all, query]);

  const selected = all.find((playbook) => playbook.id === selectedId) ?? all[0] ?? null;
  const selectedSaved = selected ? (saved.find((playbook) => playbook.id === selected.id) ?? null) : null;
  const draft = selected ? (drafts[selected.id] ?? selected) : null;

  const setDraft = (next: Playbook) => setDrafts((current) => ({ ...current, [next.id]: next }));
  const dropDraft = (id: string) =>
    setDrafts((current) => {
      const { [id]: _dropped, ...rest } = current;
      return rest;
    });
  const addDraft = (playbook: Playbook) => {
    setDraft(playbook);
    setSelectedId(playbook.id);
  };
  const takenShortcuts = useMemo(
    () =>
      new Set(
        saved
          .filter((playbook) => playbook.id !== selected?.id && playbook.shortcut)
          .map((playbook) => playbook.shortcut!),
      ),
    [saved, selected?.id],
  );
  const canStart = Boolean(activeWorkspaceId && activeTaskId && activeProvider && MISSION_PROVIDERS.has(activeProvider));

  const newMenu = (
    <DropdownMenu
      placement="bottom-end"
      triggerAsChild
      trigger={
        <Button variant="quiet" size="iconSm" iconOnly aria-label="New playbook">
          <Plus aria-hidden />
        </Button>
      }
      groups={[
        {
          items: [
            { label: "Blank playbook", icon: <Plus />, onSelect: () => addDraft(createBlankPlaybook({ now: new Date(), taken: all })) },
          ],
        },
        {
          label: "From a template",
          items: PLAYBOOK_STARTERS.map((starter) => ({
            label: starter.template.name,
            icon: <BookOpen />,
            onSelect: () => addDraft(createPlaybookFromStarter(starter, { now: new Date() })),
          })),
        },
      ]}
    />
  );

  if (all.length === 0) {
    return (
      <div className={sx(styles.scroll)}>
        <div className={sx(styles.empty)}>
          <div>
            <h2 className={sx(styles.emptyTitle)}>Save how you work as a playbook</h2>
            <p className={sx(styles.emptyText)}>
              A playbook is the stages you would otherwise prompt one by one — understand, build, verify, open a PR.
              Start a mission with it and Stave carries the task through every stage, stopping only where you ask to
              sign off.
            </p>
          </div>
          <div className={sx(styles.emptyActions)}>
            <Button size="sm" onClick={() => addDraft(createBlankPlaybook({ now: new Date(), taken: all }))}>
              <Plus aria-hidden />
              Blank playbook
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const blank = createBlankPlaybook({ now: new Date(), taken: all });
                setDraftingId(blank.id);
                addDraft(blank);
              }}
            >
              <Sparkles aria-hidden />
              Draft with AI
            </Button>
          </div>
          <p className={sx(styles.listLabel, styles.listLabelFlush)}>Start from a template</p>
          <TemplateGallery onUse={(starter) => addDraft(createPlaybookFromStarter(starter, { now: new Date() }))} />
        </div>
      </div>
    );
  }

  return (
    <div className={sx(styles.tab)} data-testid="playbooks-tab">
      <aside className={sx(styles.master)} aria-label="Playbooks">
        <div className={sx(styles.masterHeader)}>
          <div className={sx(styles.masterSearch)}>
            <TextField
              size="sm"
              controlOnly
              aria-label="Search playbooks"
              placeholder="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {newMenu}
        </div>
        <ul className={sx(styles.list)}>
          {visible.map((playbook) => {
            const current = drafts[playbook.id] ?? playbook;
            const isSaved = saved.some((candidate) => candidate.id === playbook.id);
            const changed = Boolean(drafts[playbook.id]) && (!isSaved || JSON.stringify(drafts[playbook.id]) !== JSON.stringify(playbook));
            return (
              <li key={playbook.id}>
                <Button
                  layout="host"
                  variant="quiet"
                  press="none"
                  aria-current={playbook.id === selected?.id ? "true" : undefined}
                  xstyle={[styles.card, playbook.id === selected?.id && styles.cardActive]}
                  onClick={() => setSelectedId(playbook.id)}
                >
                  <span className={sx(styles.cardTitleRow)}>
                    <span className={sx(styles.cardTitle)}>{current.name || "Untitled playbook"}</span>
                    {changed ? <span className={sx(styles.unsavedDot)} aria-label="Unsaved changes" role="img" /> : null}
                  </span>
                  <span className={sx(styles.cardMeta)}>
                    {describeCard(current)}
                    {current.shortcut ? <code className={sx(styles.shortcut)}>!{current.shortcut}</code> : null}
                  </span>
                </Button>
              </li>
            );
          })}
          {visible.length === 0 ? <li className={sx(styles.hint)}>No playbook matches “{query}”.</li> : null}
        </ul>
      </aside>
      {selected && draft ? (
        <div className={sx(styles.detail)}>
          <div className={sx(styles.compactPicker)}>
            <Select
              size="sm"
              aria-label="Playbook"
              value={selected.id}
              options={all.map((playbook) => ({ value: playbook.id, label: (drafts[playbook.id] ?? playbook).name }))}
              onValueChange={(value) => setSelectedId(String(value))}
            />
            {newMenu}
          </div>
          <PlaybookEditor
            key={selected.id}
            draft={draft}
            saved={selectedSaved}
            takenShortcuts={takenShortcuts}
            initialDrafting={draftingId === selected.id}
            onChange={setDraft}
            onSave={(playbook) => {
              updateSettings({ patch: { playbooks: upsertPlaybook(saved, playbook) } });
              dropDraft(playbook.id);
            }}
            onDiscard={() => dropDraft(selected.id)}
            onDuplicate={() => {
              if (!selectedSaved) return;
              addDraft(duplicatePlaybook({ playbook: selectedSaved, now: new Date(), taken: all }));
            }}
            onDelete={() => {
              if (selectedSaved) updateSettings({ patch: { playbooks: removePlaybook(saved, selected.id) } });
              dropDraft(selected.id);
              setSelectedId(null);
            }}
            onStartMission={
              canStart && activeWorkspaceId && activeTaskId
                ? () => openStartSheet({ workspaceId: activeWorkspaceId, taskId: activeTaskId, playbookId: selected.id })
                : null
            }
          />
        </div>
      ) : null}
    </div>
  );
}

