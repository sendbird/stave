import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { workspaceInformationPanelStyles as panelStyles } from "./workspace-information-panel.styles";
import { Textarea as AdsTextarea } from "@/components/ui/textarea";
import { useEffect, useId, useRef, useState } from "react";
import { ActionButton } from "@/components/system/ActionButton";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import {
  emptyResumeBriefFields,
  getWorkspaceInstructions,
  SHARED_INSTRUCTIONS_CONTEXT_LIMIT,
  SHARED_INSTRUCTIONS_MAX_LENGTH,
  WorkspaceResumeBriefSchema,
  type ResumeBriefFields,
  type WorkspaceResumeBrief,
} from "@/lib/workspace-resume-brief";

import {
  loadDirectionDraft,
  saveDirectionDraft,
} from "@/lib/workspace-direction-draft-client";
import { workspaceResumeBriefStyles as styles } from "./workspace-resume-brief.styles";
import { formatRelativeTime } from "@/components/layout/automation-center/automation-center.utils";

/** Shared instructions in Information, retained across workspace tasks. */
export function WorkspaceResumeBrief(props: {
  workspaceId: string;
  brief?: WorkspaceResumeBrief | null;
}) {
  const id = useId();
  const [openSections, setOpenSections] = useState<string[]>(["instructions"]);
  const isOpen = openSections.includes("instructions");
  const [draft, setDraft] = useState<{
    fields: ResumeBriefFields;
    baseUpdatedAt: string;
    editing: boolean;
    error: string;
  }>(() => ({
    fields: props.brief ?? emptyResumeBriefFields(),
    baseUpdatedAt: props.brief?.updatedAt ?? "",
    editing: false,
    error: "",
  }));
  const [saving, setSaving] = useState(false);
  const [draftStatus, setDraftStatus] = useState("Loading local draft…");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const draftRevision = useRef(0);
  const lastWrittenAt = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadDirectionDraft(props.workspaceId)
      .then((saved) => {
        if (cancelled) return;
        if (saved)
          setDraft({
            fields: saved,
            baseUpdatedAt: saved.updatedAt,
            editing: true,
            error: "",
          });
        setDraftLoaded(true);
        setDraftStatus(
          saved
            ? "Unsaved draft on this device — tasks still use the saved instructions."
            : "",
        );
      })
      .catch(() => {
        if (!cancelled)
          setDraftStatus(
            "The local draft could not be read. Retry before editing.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [props.workspaceId, loadAttempt]);
  const resetDraft = async () => {
    if (saving) return;
    setSaving(true);
    ++draftRevision.current;
    try {
      await saveDirectionDraft(props.workspaceId, null);
      setDraft({
        fields: props.brief ?? emptyResumeBriefFields(),
        baseUpdatedAt: props.brief?.updatedAt ?? "",
        editing: false,
        error: "",
      });
      lastWrittenAt.current = null;
      setDraftStatus("");
    } catch {
      setDraft((current) => ({
        ...current,
        error: "The draft could not be cleared. Your edits are kept.",
      }));
    } finally {
      setSaving(false);
    }
  };
  const changeField = (key: keyof ResumeBriefFields, value: string) => {
    const next = {
      ...draft,
      fields: { ...draft.fields, [key]: value },
      error: "",
    };
    const revision = ++draftRevision.current;
    setDraft(next);
    setDraftStatus("Saving draft…");
    void saveDirectionDraft(props.workspaceId, {
      ...next.fields,
      updatedAt: draft.baseUpdatedAt,
      sourceTaskId: null,
    })
      .then(() => {
        if (revision === draftRevision.current)
          setDraftStatus(
            "Draft kept on this device — save to apply it to tasks.",
          );
      })
      .catch(() => {
        if (revision === draftRevision.current)
          setDraftStatus(
            "Draft save failed. Keep this panel open and save the instructions.",
          );
      });
  };
  const save = async () => {
    if (saving || !draftLoaded) return;
    ++draftRevision.current;
    const state = useAppStore.getState();
    if (
      state.activeWorkspaceId !== props.workspaceId ||
      !state.hasHydratedWorkspaces ||
      !state.workspaces.some((workspace) => workspace.id === props.workspaceId)
    )
      return;
    const currentStamp =
      state.workspaceInformation.resumeBrief?.updatedAt ?? "";
    if (
      currentStamp !== draft.baseUpdatedAt &&
      currentStamp !== lastWrittenAt.current
    ) {
      setDraft((current) => ({
        ...current,
        error:
          "The saved instructions changed while you were editing. Your draft is kept. Copy any changes you need, then load the saved instructions.",
      }));
      return;
    }
    setSaving(true);
    const updatedAt = new Date().toISOString();
    try {
      const brief = WorkspaceResumeBriefSchema.parse({
        ...emptyResumeBriefFields(),
        instructions: getWorkspaceInstructions(draft.fields),
        updatedAt,
        sourceTaskId: state.activeTaskId || null,
      });
      state.updateWorkspaceInformation({
        updater: (current) => ({ ...current, resumeBrief: brief }),
      });
      lastWrittenAt.current = updatedAt;
      await useAppStore.getState().flushActiveWorkspaceSnapshot();
      let cleanupError = "";
      try {
        await saveDirectionDraft(props.workspaceId, null);
      } catch {
        cleanupError =
          "Instructions saved. The local draft could not be cleared and may reappear when this panel opens.";
      }
      setDraft({
        fields: brief,
        baseUpdatedAt: updatedAt,
        editing: false,
        error: cleanupError,
      });
      lastWrittenAt.current = null;
      setDraftStatus("");
    } catch {
      setDraft((current) => ({
        ...current,
        error:
          "Saving the instructions could not be confirmed. Your draft is kept; retry before leaving.",
      }));
    } finally {
      setSaving(false);
    }
  };
  const savedInstructions = getWorkspaceInstructions(props.brief);
  const hasBrief = Boolean(savedInstructions.trim());
  const draftText = getWorkspaceInstructions(draft.fields);
  const abridged =
    (draft.editing ? draftText : savedInstructions).trim().length >
    SHARED_INSTRUCTIONS_CONTEXT_LIMIT;
  return (
    <section aria-labelledby={`${id}-heading`} className={sx(styles.root)}>
      <Accordion
        value={openSections}
        onValueChange={(value) => setOpenSections(value as string[])}
      >
        <AccordionItem
          value="instructions"
          className={sx(panelStyles.sectionItem, panelStyles.sectionItemFirst)}
        >
          <div className={sx(panelStyles.sectionRow)}>
            <AccordionTrigger
              id={`${id}-heading`}
              className={sx(panelStyles.sectionTrigger)}
            >
              <span className={sx(panelStyles.sectionTitleRow)}>
                <span
                  className={sx(panelStyles.sectionMark)}
                  aria-hidden="true"
                >
                  <span className={sx(panelStyles.sectionMarkIcon)}>
                    <FileText size={16} />
                  </span>
                  <span className={sx(panelStyles.sectionMarkChevronSlot)}>
                    {isOpen ? (
                      <ChevronDown
                        className={sx(panelStyles.sectionMarkChevron)}
                      />
                    ) : (
                      <ChevronRight
                        className={sx(panelStyles.sectionMarkChevron)}
                      />
                    )}
                  </span>
                </span>
                <span className={sx(panelStyles.sectionTitle)}>
                  Shared instructions
                </span>
              </span>
            </AccordionTrigger>
            {isOpen && !draft.editing ? (
              <ActionButton
                size="xs"
                weight="quiet"
                disabled={!draftLoaded}
                onClick={() =>
                  setDraft({
                    fields: props.brief ?? emptyResumeBriefFields(),
                    baseUpdatedAt: props.brief?.updatedAt ?? "",
                    editing: true,
                    error: "",
                  })
                }
              >
                {hasBrief ? "Edit instructions" : "Add instructions"}
              </ActionButton>
            ) : null}
          </div>
          <AccordionContent className={sx(panelStyles.sectionPanel)}>
            <p className={sx(styles.intro)}>
              Standing rules for this workspace. Once saved they travel with
              every message in every task here, until you change them.
            </p>
            <p role="status" className={sx(styles.draftStatus)}>
              {draftStatus}
            </p>
            {!draftLoaded && draftStatus.includes("could not") ? (
              <ActionButton
                size="xs"
                onClick={() => {
                  setDraftStatus("Loading local draft…");
                  setLoadAttempt((value) => value + 1);
                }}
              >
                Retry draft
              </ActionButton>
            ) : null}
            {draft.error ? (
              <p role="alert" className={sx(styles.error)}>
                {draft.error}
              </p>
            ) : null}
            {draft.editing ? (
              <form
                className={sx(styles.form)}
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                <div className={sx(styles.field)}>
                  <label
                    htmlFor={`${id}-instructions`}
                    className={sx(styles.fieldLabel)}
                  >
                    Instructions for all tasks
                  </label>
                  <AdsTextarea
                    id={`${id}-instructions`}
                    aria-describedby={`${id}-instructions-hint`}
                    maxLength={SHARED_INSTRUCTIONS_MAX_LENGTH}
                    rows={6}
                    value={draftText}
                    placeholder="For example: Preserve existing keyboard shortcuts. Link the verification results when finishing."
                    disabled={saving}
                    onChange={(event) =>
                      changeField("instructions", event.target.value)
                    }
                  />
                  <div
                    id={`${id}-instructions-hint`}
                    className={sx(styles.fieldFooter)}
                  >
                    <span className={sx(styles.fieldHint)}>
                      Short standing rules work best. Plans belong in files,
                      action items in Todos.
                    </span>
                    <span
                      className={sx(
                        styles.counter,
                        abridged && styles.counterWarning,
                      )}
                    >
                      {draftText.length.toLocaleString()} /{" "}
                      {SHARED_INSTRUCTIONS_MAX_LENGTH.toLocaleString()}
                    </span>
                  </div>
                  {abridged ? (
                    <p className={sx(styles.warning)}>
                      Longer than{" "}
                      {SHARED_INSTRUCTIONS_CONTEXT_LIMIT.toLocaleString()}{" "}
                      characters: agents receive an abridged copy. Put the
                      essentials first.
                    </p>
                  ) : null}
                </div>
                <div className={sx(styles.formActions)}>
                  <ActionButton type="submit" weight="primary" loading={saving}>
                    Save instructions
                  </ActionButton>
                  <ActionButton
                    type="button"
                    weight="quiet"
                    disabled={saving}
                    onClick={() => void resetDraft()}
                  >
                    Discard edits
                  </ActionButton>
                </div>
              </form>
            ) : hasBrief ? (
              <dl className={sx(styles.list)}>
                <div className={sx(styles.meta)}>
                  <dt>
                    <VisuallyHidden>Status</VisuallyHidden>
                  </dt>
                  <dd className={sx(styles.metaRow)}>
                    <span className={sx(styles.appliedMark)}>
                      Active in every task
                    </span>
                    <time
                      dateTime={props.brief!.updatedAt}
                      title={new Date(props.brief!.updatedAt).toLocaleString()}
                    >
                      Updated {formatRelativeTime(props.brief!.updatedAt)}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>
                    <VisuallyHidden>Instructions for all tasks</VisuallyHidden>
                  </dt>
                  <dd className={sx(styles.definition)}>{savedInstructions}</dd>
                </div>
                {abridged ? (
                  <div>
                    <dt>
                      <VisuallyHidden>Context note</VisuallyHidden>
                    </dt>
                    <dd className={sx(styles.warning)}>
                      Agents receive the first{" "}
                      {SHARED_INSTRUCTIONS_CONTEXT_LIMIT.toLocaleString()}{" "}
                      characters verbatim and a note that the rest is abridged.
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className={sx(styles.empty)}>
                Nothing shared yet. Add rules every task should follow, such as
                a verification step, a style constraint, or files to avoid.
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
