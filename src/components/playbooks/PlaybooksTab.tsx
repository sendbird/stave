import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, BookOpen, CalendarClock, Hand, Plus, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { DropdownMenu } from "@/components/ads/components/DropdownMenu";
import { Select } from "@/components/ads/components/Select";
import { TextField } from "@/components/ads/components/TextField";
import { sx } from "@/components/ads/utils/stylex";
import {
  createBlankPlaybook,
  duplicatePlaybook,
  explainPlaybookLimit,
  playbooksEqual,
  removePlaybook,
  stageAsksFirst,
  upsertPlaybook,
} from "@/lib/playbooks/library";
import { describeUnreadablePlaybook, type UnreadablePlaybook } from "@/lib/playbooks/normalize";
import { CHECK_IN_LABELS, MAX_PLAYBOOKS, type Playbook } from "@/lib/playbooks/schema";
import { isCustomCheckIns, listSignOffStageIndexes } from "@/lib/playbooks/sign-off";
import { createPlaybookFromStarter, PLAYBOOK_STARTERS, type PlaybookStarter } from "@/lib/playbooks/starters";
import { useAppStore } from "@/store/app.store";
import { usePlaybookDraftsStore } from "@/store/playbook-drafts-store";
import { usePlaybooksUiStore } from "@/store/playbooks-ui-store";
import { MissionInsightsView, type MissionInsightsLoader } from "./MissionInsights";
import { PlaybookEditor } from "./PlaybookEditor";
import { describeStartsWhen } from "@/lib/playbooks/starts-when";
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

const NAMES_SHOWN = 3;

/**
 * Saved playbooks this version could not read. They stay kept aside,
 * unchanged, and come back once Stave can read them again.
 */
export function UnreadablePlaybooksNotice(props: { entries: readonly UnreadablePlaybook[] }) {
  const count = props.entries.length;
  if (count === 0) return null;
  const names = props.entries.flatMap((entry) => {
    const name = describeUnreadablePlaybook(entry);
    return name ? [`“${name}”`] : [];
  });
  const shown = names.slice(0, NAMES_SHOWN).join(", ");
  const more = names.length > NAMES_SHOWN ? ` and ${names.length - NAMES_SHOWN} more` : "";
  return (
    <div className={sx(styles.banner, styles.bannerNeutral)} role="status" data-testid="playbooks-unreadable">
      <AlertCircle aria-hidden className={sx(styles.bannerIcon, styles.bannerIconWarning)} />
      <div className={sx(styles.bannerBody)}>
        <span className={sx(styles.bannerLabel)}>
          {count === 1 ? "1 playbook could not be read" : `${count} playbooks could not be read`}
        </span>
        <span>
          {shown ? `${shown}${more}. ` : ""}Stave keeps {count === 1 ? "it" : "them"} aside unchanged and brings{" "}
          {count === 1 ? "it" : "them"} back once it can read {count === 1 ? "it" : "them"} — after an update, or
          when there is room.
        </span>
      </div>
    </div>
  );
}

/** The pinned entry above the playbooks: how missions went. */
const INSIGHTS_ID = "__mission-insights__";

/**
 * The Playbooks tab of the Automations center: saved ways of working on the
 * left, the one being edited on the right. Unsaved edits stay with their
 * playbook while you look at another one, or at another Automations tab.
 */
export function PlaybooksTab(props: { loadInsights?: MissionInsightsLoader } = {}) {
  const saved = useAppStore((state) => state.settings.playbooks);
  const unreadable = useAppStore((state) => state.settings.playbooksUnreadable);
  const macros = useAppStore((state) => state.settings.macros);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeWorkspaceName = useAppStore(
    (state) => state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)?.name ?? null,
  );
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const activeProvider = useAppStore(
    (state) => state.tasks.find((task) => task.id === state.activeTaskId)?.provider ?? null,
  );
  const openStartSheet = usePlaybooksUiStore((state) => state.openStartSheet);
  const centerRequest = usePlaybooksUiStore((state) => state.centerRequest);
  const consumeCenterRequest = usePlaybooksUiStore((state) => state.consumeCenterRequest);

  const drafts = usePlaybookDraftsStore((state) => state.drafts);
  const selectedId = usePlaybookDraftsStore((state) => state.selectedId);
  const setSelectedId = usePlaybookDraftsStore((state) => state.select);
  const draftingId = usePlaybookDraftsStore((state) => state.draftingId);
  const setDraftingId = usePlaybookDraftsStore((state) => state.setDraftingId);
  const setDraft = usePlaybookDraftsStore((state) => state.setDraft);
  const dropDraft = usePlaybookDraftsStore((state) => state.dropDraft);
  const [query, setQuery] = useState("");

  // "Manage playbooks" and "Edit playbook" elsewhere land here.
  useEffect(() => {
    if (!centerRequest) return;
    if (centerRequest.playbookId) setSelectedId(centerRequest.playbookId);
    consumeCenterRequest();
  }, [centerRequest, consumeCenterRequest, setSelectedId]);

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
  const macroShortcuts = useMemo(() => new Map(macros.map((macro) => [macro.slug, macro.label])), [macros]);

  const showingInsights = selectedId === INSIGHTS_ID;
  const selected = showingInsights ? null : (all.find((playbook) => playbook.id === selectedId) ?? all[0] ?? null);
  const selectedSaved = selected ? (saved.find((playbook) => playbook.id === selected.id) ?? null) : null;
  const draft = selected ? (drafts[selected.id] ?? selected) : null;
  // Draft with AI opens once, with the playbook it was asked for.
  useEffect(() => {
    if (draftingId && selected?.id === draftingId) setDraftingId(null);
  }, [draftingId, selected?.id, setDraftingId]);

  /** Settings keep at most MAX_PLAYBOOKS; a new one past that would be dropped. */
  const libraryFull = explainPlaybookLimit(saved);
  const addDraft = (playbook: Playbook) => {
    if (libraryFull) return;
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
  const savePlaybook = (playbook: Playbook): string | null => {
    const current = useAppStore.getState().settings.playbooks;
    const blocked = explainPlaybookLimit(current, playbook.id);
    if (blocked) return blocked;
    updateSettings({ patch: { playbooks: upsertPlaybook(current, playbook) } });
    // Settings validate the list again; keep the edits unless it really landed.
    const stored = useAppStore
      .getState()
      .settings.playbooks.find((candidate) => candidate.id === playbook.id);
    if (!stored || stored.updatedAt !== playbook.updatedAt) {
      return "Stave could not save this playbook. Your changes are still here.";
    }
    dropDraft(playbook.id);
    return null;
  };

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
          label: libraryFull ? `${MAX_PLAYBOOKS} of ${MAX_PLAYBOOKS} saved · delete one to add another` : undefined,
          items: [
            {
              label: "Blank playbook",
              icon: <Plus />,
              disabled: Boolean(libraryFull),
              onSelect: () => addDraft(createBlankPlaybook({ now: new Date(), taken: all })),
            },
          ],
        },
        {
          label: "From a template",
          items: PLAYBOOK_STARTERS.map((starter) => ({
            label: starter.template.name,
            icon: <BookOpen />,
            disabled: Boolean(libraryFull),
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
          <UnreadablePlaybooksNotice entries={unreadable} />
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

  const pickerOptions = [
    { value: INSIGHTS_ID, label: "Mission insights" },
    ...all.map((playbook) => ({ value: playbook.id, label: (drafts[playbook.id] ?? playbook).name })),
  ];

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
        <Button
          layout="host"
          variant="quiet"
          press="none"
          aria-current={showingInsights ? "true" : undefined}
          xstyle={[styles.card, showingInsights && styles.cardActive]}
          onClick={() => setSelectedId(INSIGHTS_ID)}
        >
          <span className={sx(styles.cardTitleRow)}>
            <BarChart3 aria-hidden className={sx(styles.chipIcon)} />
            <span className={sx(styles.cardTitle)}>Mission insights</span>
          </span>
          <span className={sx(styles.cardMeta)}>How missions went</span>
        </Button>
        <UnreadablePlaybooksNotice entries={unreadable} />
        <p className={sx(styles.listLabel)}>Playbooks</p>
        <ul className={sx(styles.list)}>
          {visible.map((playbook) => {
            const current = drafts[playbook.id] ?? playbook;
            const isSaved = saved.some((candidate) => candidate.id === playbook.id);
            const changed = Boolean(drafts[playbook.id]) && (!isSaved || !playbooksEqual(drafts[playbook.id]!, playbook));
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
                    {current.startsWhen ? (
                      <CalendarClock
                        role="img"
                        aria-label={`Starts when: ${describeStartsWhen(current.startsWhen)}`}
                        className={sx(styles.cardTrigger)}
                      >
                        <title>{`Starts when: ${describeStartsWhen(current.startsWhen)}`}</title>
                      </CalendarClock>
                    ) : null}
                  </span>
                </Button>
              </li>
            );
          })}
          {visible.length === 0 ? <li className={sx(styles.hint)}>No playbook matches “{query}”.</li> : null}
        </ul>
        {libraryFull ? <p className={sx(styles.hint, styles.listNote)}>{libraryFull}</p> : null}
      </aside>
      {showingInsights ? (
        <div className={sx(styles.detail)}>
          <div className={sx(styles.compactPicker)}>
            <Select
              size="sm"
              aria-label="Playbook"
              value={INSIGHTS_ID}
              options={pickerOptions}
              onValueChange={(value) => setSelectedId(String(value))}
            />
          </div>
          <MissionInsightsView load={props.loadInsights} />
        </div>
      ) : null}
      {selected && draft ? (
        <div className={sx(styles.detail)}>
          <div className={sx(styles.compactPicker)}>
            <Select
              size="sm"
              aria-label="Playbook"
              value={selected.id}
              options={pickerOptions}
              onValueChange={(value) => setSelectedId(String(value))}
            />
            {newMenu}
          </div>
          <PlaybookEditor
            key={selected.id}
            activeWorkspace={activeWorkspaceId ? { id: activeWorkspaceId, name: activeWorkspaceName ?? "This workspace" } : null}
            draft={draft}
            saved={selectedSaved}
            takenShortcuts={takenShortcuts}
            macroShortcuts={macroShortcuts}
            initialDrafting={draftingId === selected.id}
            saveBlockedReason={selectedSaved ? null : libraryFull}
            duplicateBlockedReason={libraryFull ? `${MAX_PLAYBOOKS} of ${MAX_PLAYBOOKS} saved` : null}
            onChange={setDraft}
            onSave={savePlaybook}
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
