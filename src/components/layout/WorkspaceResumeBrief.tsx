import { formatNumber, formatDateTime } from "@/i18n/format";
import { i18n, useTranslation } from "@/i18n";
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
  const { t: tI18n } = useTranslation(["workspace"]);
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
        error: i18n.t("workspace:additionalCopy.message14"),
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
          i18n.t("workspace:additionalCopy.message15"),
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
          i18n.t("workspace:additionalCopy.message16"),
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
        xstyle={panelStyles.sectionList}
      >
        <AccordionItem
          value="instructions"
          xstyle={[panelStyles.sectionItem, panelStyles.sectionItemFirst]}
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
                  {tI18n("workspace:workspaceResumeBrief.sharedInstructions")}</span>
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
                {hasBrief ? tI18n("workspace:workspaceResumeBrief.editInstructions") : tI18n("workspace:workspaceResumeBrief.addInstructions")}
              </ActionButton>
            ) : null}
          </div>
          <AccordionContent className={sx(panelStyles.sectionPanel)}>
            <p className={sx(styles.intro)}>
              {tI18n("workspace:workspaceResumeBrief.standingRulesForThisWorkspaceOnceSaved")}</p>
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
                {tI18n("workspace:workspaceResumeBrief.retryDraft")}</ActionButton>
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
                    {tI18n("workspace:workspaceResumeBrief.instructionsForAllTasks")}</label>
                  <AdsTextarea
                    id={`${id}-instructions`}
                    aria-describedby={`${id}-instructions-hint`}
                    maxLength={SHARED_INSTRUCTIONS_MAX_LENGTH}
                    rows={6}
                    value={draftText}
                    placeholder={tI18n("workspace:workspaceResumeBrief.forExamplePreserveExistingKeyboardShortcutsLink")}
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
                      {tI18n("workspace:workspaceResumeBrief.shortStandingRulesWorkBestPlansBelong")}</span>
                    <span
                      className={sx(
                        styles.counter,
                        abridged && styles.counterWarning,
                      )}
                    >
                      {formatNumber(draftText.length)} /{" "}
                      {formatNumber(SHARED_INSTRUCTIONS_MAX_LENGTH)}
                    </span>
                  </div>
                  {abridged ? (
                    <p className={sx(styles.warning)}>
                      {tI18n("workspace:workspaceResumeBrief.instructionsAbridged", { limit: formatNumber(SHARED_INSTRUCTIONS_CONTEXT_LIMIT) })}</p>
                  ) : null}
                </div>
                <div className={sx(styles.formActions)}>
                  <ActionButton type="submit" weight="primary" loading={saving}>
                    {tI18n("workspace:workspaceResumeBrief.saveInstructions")}</ActionButton>
                  <ActionButton
                    type="button"
                    weight="quiet"
                    disabled={saving}
                    onClick={() => void resetDraft()}
                  >
                    {tI18n("workspace:workspaceResumeBrief.discardEdits")}</ActionButton>
                </div>
              </form>
            ) : hasBrief ? (
              <dl className={sx(styles.list)}>
                <div className={sx(styles.meta)}>
                  <dt>
                    <VisuallyHidden>{tI18n("workspace:workspaceResumeBrief.status")}</VisuallyHidden>
                  </dt>
                  <dd className={sx(styles.metaRow)}>
                    <span className={sx(styles.appliedMark)}>
                      {tI18n("workspace:workspaceResumeBrief.activeInEveryTask")}</span>
                    <time
                      dateTime={props.brief!.updatedAt}
                      title={formatDateTime(new Date(props.brief!.updatedAt))}
                    >
          {tI18n("workspace:workspaceResumeBrief.updatedAt", { time: formatRelativeTime(props.brief!.updatedAt) })}
        </time>
                  </dd>
                </div>
                <div>
                  <dt>
                    <VisuallyHidden>{tI18n("workspace:workspaceResumeBrief.instructionsForAllTasks")}</VisuallyHidden>
                  </dt>
                  <dd className={sx(styles.definition)}>{savedInstructions}</dd>
                </div>
                {abridged ? (
                  <div>
                    <dt>
                      <VisuallyHidden>{tI18n("workspace:workspaceResumeBrief.contextNote")}</VisuallyHidden>
                    </dt>
                    <dd className={sx(styles.warning)}>
                      {tI18n("workspace:workspaceResumeBrief.instructionsLimit", { limit: formatNumber(SHARED_INSTRUCTIONS_CONTEXT_LIMIT) })}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className={sx(styles.empty)}>
                {tI18n("workspace:workspaceResumeBrief.nothingSharedYetAddRulesEveryTask")}</p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
