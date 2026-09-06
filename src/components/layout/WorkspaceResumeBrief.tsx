import { Textarea as AdsTextarea } from "@/components/ui/textarea";
import { useEffect, useId, useRef, useState } from "react";
import { ActionButton } from "@/components/system/ActionButton";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import {
  emptyResumeBriefFields,
  RESUME_BRIEF_FIELDS,
  WorkspaceResumeBriefSchema,
  type ResumeBriefFields,
  type WorkspaceResumeBrief,
} from "@/lib/workspace-resume-brief";

import {
  loadDirectionDraft,
  saveDirectionDraft,
} from "@/lib/workspace-direction-draft-client";
import { workspaceResumeBriefStyles as styles } from "./workspace-resume-brief.styles";

/** A manually maintained direction, above the replaceable turn recap. */
export function WorkspaceResumeBrief(props: {
  workspaceId: string;
  brief?: WorkspaceResumeBrief | null;
}) {
  const id = useId();
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
        setDraftStatus(saved ? "Draft saved on this device" : "");
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
          setDraftStatus("Draft saved on this device");
      })
      .catch(() => {
        if (revision === draftRevision.current)
          setDraftStatus(
            "Draft save failed. Keep this panel open and save the direction.",
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
          "The saved brief changed while you were editing. Your draft is kept. Copy any changes you need, then load the saved brief.",
      }));
      return;
    }
    setSaving(true);
    const updatedAt = new Date().toISOString();
    try {
      const brief = WorkspaceResumeBriefSchema.parse({
        ...draft.fields,
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
          "Direction saved. The local draft could not be cleared and may reappear when this panel opens.";
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
          "Saving the brief could not be confirmed. Your draft is kept; retry before leaving.",
      }));
    } finally {
      setSaving(false);
    }
  };
  const hasBrief =
    props.brief &&
    RESUME_BRIEF_FIELDS.some(({ key }) => props.brief?.[key].trim());
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className={sx(styles.root)}
    >
      <div className={sx(styles.header)}>
        <h2
          id={`${id}-heading`}
          className={sx(styles.heading)}
        >
          Workspace direction
        </h2>
        {!draft.editing ? (
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
            {hasBrief ? "Edit direction" : "Set direction"}
          </ActionButton>
        ) : null}
      </div>
      <p className={sx(styles.intro)}>
        Keep the goal, agreed decisions, and next step across tasks. Automatic
        turn summaries do not replace this direction.
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
          {RESUME_BRIEF_FIELDS.map(({ key, label, hint }) => (
            <div key={key} className={sx(styles.field)}>
              <label
                htmlFor={`${id}-${key}`}
                className={sx(styles.fieldLabel)}
              >
                {label}
              </label>
              <p
                id={`${id}-${key}-hint`}
                className={sx(styles.fieldHint)}
              >
                {hint}
              </p>
              <AdsTextarea
                id={`${id}-${key}`}
                aria-describedby={`${id}-${key}-hint`}
                maxLength={2000}
                rows={key === "goal" ? 3 : 2}
                value={draft.fields[key]}
                disabled={saving}
                onChange={(event) => changeField(key, event.target.value)}
              />
            </div>
          ))}
          <div className={sx(styles.formActions)}>
            <ActionButton type="submit" weight="primary" loading={saving}>
              Save direction
            </ActionButton>
            <ActionButton
              type="button"
              weight="quiet"
              disabled={saving}
              onClick={() => void resetDraft()}
            >
              Load saved brief
            </ActionButton>
          </div>
        </form>
      ) : hasBrief ? (
        <dl className={sx(styles.list)}>
          {RESUME_BRIEF_FIELDS.map(({ key, label }) =>
            props.brief?.[key].trim() ? (
              <div key={key}>
                <dt className={sx(styles.term)}>
                  {label}
                </dt>
                <dd className={sx(styles.definition)}>
                  {props.brief[key]}
                </dd>
              </div>
            ) : null,
          )}
          <div className={sx(styles.meta)}>
            <dt>
              <VisuallyHidden>Last maintained</VisuallyHidden>
            </dt>
            <dd className={sx(styles.metaValue)}>Updated {new Date(props.brief!.updatedAt).toLocaleString()}</dd>
          </div>
        </dl>
      ) : (
        <p className={sx(styles.empty)}>
          Set a goal and completion conditions so the next task starts with the
          same direction. Keep detailed plans in linked files.
        </p>
      )}
    </section>
  );
}
