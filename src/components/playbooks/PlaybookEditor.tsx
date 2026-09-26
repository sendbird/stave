import { useMemo, useState } from "react";
import { AlertCircle, Copy, Ellipsis, Play, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { DropdownMenu } from "@/components/ads/components/DropdownMenu";
import { TextField } from "@/components/ads/components/TextField";
import { Textarea } from "@/components/ads/components/Textarea";
import { Tooltip } from "@/components/ads/components/Tooltip";
import { sx } from "@/components/ads/utils/stylex";
import { applyCheckIns, describeSignOffs, groupIssuesByField } from "@/lib/playbooks/library";
import { parsePlaybook } from "@/lib/playbooks/normalize";
import {
  CHECK_IN_LABELS,
  CHECK_INS,
  PLAYBOOK_LIMITS,
  type Playbook,
} from "@/lib/playbooks/schema";
import { isCustomCheckIns } from "@/lib/playbooks/sign-off";
import type { AutomationPermissionMode } from "@/lib/automations";
import { draftPlaybookWithAi } from "@/store/playbook-draft-runtime";
import { DraftWithAi } from "./DraftWithAi";
import { Segmented } from "./Segmented";
import { StageList } from "./StageList";
import { playbookStyles as styles } from "./playbooks.styles";

const PERMISSION_OPTIONS: ReadonlyArray<{ value: AutomationPermissionMode; label: string; description: string }> = [
  { value: "guided", label: "Guided", description: "Asks before sensitive actions." },
  { value: "auto", label: "Auto", description: "Never asks; for trusted repositories." },
  { value: "manual", label: "Manual", description: "Follows the task's own permission settings." },
];

const CHECK_IN_OPTIONS = CHECK_INS.map((value) => ({ value, label: CHECK_IN_LABELS[value] }));

export interface PlaybookEditorProps {
  draft: Playbook;
  /** The saved version, or null for a playbook that was never saved. */
  saved: Playbook | null;
  /** Shortcuts other playbooks use, for a collision hint. */
  takenShortcuts: ReadonlySet<string>;
  onChange: (draft: Playbook) => void;
  onSave: (playbook: Playbook) => void;
  onDiscard: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Starts a mission with the saved playbook on the task in view, or null when there is none. */
  onStartMission: (() => void) | null;
  runDraft?: typeof draftPlaybookWithAi;
  /** Opens with Draft with AI showing. */
  initialDrafting?: boolean;
}

/**
 * One playbook, edited in place: name and purpose as the heading, a property
 * grid for check-ins, shortcut and permissions, then the stages. Nothing is
 * written until Save, which validates the whole playbook and points at each
 * field that needs attention.
 */
export function PlaybookEditor(props: PlaybookEditorProps) {
  const { draft } = props;
  const [attempted, setAttempted] = useState(false);
  const [drafting, setDrafting] = useState(Boolean(props.initialDrafting));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const dirty = useMemo(
    () => !props.saved || JSON.stringify(props.saved) !== JSON.stringify(draft),
    [draft, props.saved],
  );
  const parsed = useMemo(() => parsePlaybook(draft), [draft]);
  const issues = useMemo(
    () => (attempted && !parsed.ok ? groupIssuesByField(parsed.issues) : new Map<string, string>()),
    [attempted, parsed],
  );
  const custom = isCustomCheckIns(draft);
  const shortcutTaken = Boolean(draft.shortcut && props.takenShortcuts.has(draft.shortcut));
  const permissionMode = draft.runtime?.permissionMode ?? "guided";
  const save = () => {
    setAttempted(true);
    if (parsed.ok && !shortcutTaken) props.onSave({ ...parsed.playbook, updatedAt: new Date().toISOString() });
  };
  const startBlockedReason = dirty
    ? "Save the playbook before starting a mission with it."
    : !props.onStartMission
      ? "Open a Claude or Codex task to start a mission on it."
      : null;

  return (
    <div className={sx(styles.detail)}>
      <div className={sx(styles.scroll)}>
        <div className={sx(styles.editor)}>
          <header className={sx(styles.heading)}>
            <div className={sx(styles.headingText)}>
              <input
                className={sx(styles.nameInput)}
                value={draft.name}
                maxLength={PLAYBOOK_LIMITS.name}
                placeholder="Name this playbook"
                aria-label="Playbook name"
                aria-invalid={issues.has("name") || undefined}
                onChange={(event) => props.onChange({ ...draft, name: event.target.value })}
              />
              {issues.get("name") ? <p className={sx(styles.fieldError)}>{issues.get("name")}</p> : null}
              <textarea
                className={sx(styles.purposeInput)}
                value={draft.purpose}
                maxLength={PLAYBOOK_LIMITS.purpose}
                rows={1}
                placeholder="What outcome does this playbook deliver?"
                aria-label="Purpose"
                aria-invalid={issues.has("purpose") || undefined}
                onChange={(event) => props.onChange({ ...draft, purpose: event.target.value })}
              />
              {issues.get("purpose") ? <p className={sx(styles.fieldError)}>{issues.get("purpose")}</p> : null}
            </div>
            <div className={sx(styles.headingActions)}>
              <Tooltip content={startBlockedReason ?? "Hand the task in view to this playbook"}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={startBlockedReason !== null}
                  onClick={() => props.onStartMission?.()}
                >
                  <Play aria-hidden />
                  Start mission
                </Button>
              </Tooltip>
              {confirmingDelete ? (
                <>
                  <Button variant="danger" size="sm" onClick={props.onDelete}>
                    Delete
                  </Button>
                  <Button variant="quiet" size="sm" onClick={() => setConfirmingDelete(false)}>
                    Keep
                  </Button>
                </>
              ) : (
                <DropdownMenu
                  placement="bottom-end"
                  triggerAsChild
                  trigger={
                    <Button variant="quiet" size="iconSm" iconOnly aria-label="More playbook actions">
                      <Ellipsis aria-hidden />
                    </Button>
                  }
                  groups={[
                    { items: [{ label: "Duplicate", icon: <Copy />, disabled: !props.saved, onSelect: props.onDuplicate }] },
                    {
                      items: [
                        {
                          label: props.saved ? "Delete playbook" : "Discard new playbook",
                          icon: <Trash2 />,
                          tone: "danger",
                          onSelect: () => (props.saved ? setConfirmingDelete(true) : props.onDelete()),
                        },
                      ],
                    },
                  ]}
                />
              )}
            </div>
          </header>

          {attempted && (!parsed.ok || shortcutTaken) ? (
            <div className={sx(styles.banner)} role="alert">
              <AlertCircle aria-hidden className={sx(styles.bannerIcon)} />
              <span>
                {parsed.ok
                  ? "Choose a shortcut no other playbook uses."
                  : `Fix ${parsed.issues.length === 1 ? "one field" : `${parsed.issues.length} fields`} before saving.${
                      issues.get("") ? ` ${issues.get("")}` : ""
                    }`}
              </span>
            </div>
          ) : null}

          {drafting ? (
            <DraftWithAi
              run={props.runDraft ?? draftPlaybookWithAi}
              replacesChanges={dirty && Boolean(props.saved)}
              onClose={() => setDrafting(false)}
              onDraft={(playbook) => {
                // Keep the identity; the draft brings stages and wording.
                props.onChange({ ...playbook, id: draft.id, createdAt: draft.createdAt, shortcut: draft.shortcut });
                setDrafting(false);
                setAttempted(true);
              }}
            />
          ) : null}

          <dl className={sx(styles.properties)}>
            <dt className={sx(styles.propertyLabel)}>Check-ins</dt>
            <dd className={sx(styles.propertyValue)}>
              <div className={sx(styles.propertyRow)}>
                <Segmented
                  aria-label="Check-ins"
                  value={draft.checkIns}
                  options={CHECK_IN_OPTIONS}
                  onChange={(checkIns) => props.onChange(applyCheckIns(draft, checkIns))}
                />
                {custom ? (
                  <Tooltip content="Some stages ask differently from the preset. Choose a preset to reset them.">
                    <Badge size="sm" tone="accent">
                      Custom
                    </Badge>
                  </Tooltip>
                ) : null}
              </div>
              <p className={sx(styles.hint)}>{describeSignOffs(draft)}. The hand on a stage changes it.</p>
            </dd>

            <dt className={sx(styles.propertyLabel)}>Shortcut</dt>
            <dd className={sx(styles.propertyValue)}>
              <div className={sx(styles.shortcutField)}>
                <span className={sx(styles.shortcutPrefix)} aria-hidden>
                  !
                </span>
                <TextField
                  size="sm"
                  controlOnly
                  aria-label="Shortcut"
                  placeholder="request-to-pr"
                  value={draft.shortcut ?? ""}
                  maxLength={PLAYBOOK_LIMITS.shortcut}
                  onChange={(event) => {
                    const value = event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
                    const { shortcut: _previous, ...rest } = draft;
                    props.onChange(value ? { ...rest, shortcut: value } : rest);
                  }}
                />
              </div>
              {issues.get("shortcut") || shortcutTaken ? (
                <p className={sx(styles.fieldError)}>
                  {issues.get("shortcut") ?? `Another playbook already uses !${draft.shortcut}.`}
                </p>
              ) : (
                <p className={sx(styles.hint)}>
                  {draft.shortcut
                    ? `Type !${draft.shortcut} in the composer to hand the task to this playbook.`
                    : "Optional. Lets you start it from the composer with !shortcut."}
                </p>
              )}
            </dd>

            <dt className={sx(styles.propertyLabel)}>Permissions</dt>
            <dd className={sx(styles.propertyValue)}>
              <Segmented
                aria-label="Default permissions"
                value={permissionMode}
                options={PERMISSION_OPTIONS}
                onChange={(next) =>
                  props.onChange({
                    ...draft,
                    runtime: { providerId: draft.runtime?.providerId ?? "claude-code", ...draft.runtime, permissionMode: next },
                  })
                }
              />
              <p className={sx(styles.hint)}>
                {PERMISSION_OPTIONS.find((option) => option.value === permissionMode)?.description} The default for
                new missions; a saved playbook never grants permissions, so you confirm them at every start.
              </p>
            </dd>

            <dt className={sx(styles.propertyLabel)}>Constraints</dt>
            <dd className={sx(styles.propertyValue)}>
              <Textarea
                size="sm"
                aria-label="Constraints"
                placeholder="Rules every stage follows, such as “Do not change the public API”."
                value={draft.constraints ?? ""}
                maxLength={PLAYBOOK_LIMITS.constraints}
                autoResize
                maxRows={6}
                error={issues.get("constraints")}
                onChange={(event) => {
                  const { constraints: _previous, ...rest } = draft;
                  props.onChange(event.target.value ? { ...rest, constraints: event.target.value } : rest);
                }}
              />
            </dd>
          </dl>

          <StageList playbook={draft} issues={issues} onChange={props.onChange} />
        </div>
      </div>
      <footer className={sx(styles.footer)}>
        {drafting ? null : (
          <Button variant="quiet" size="sm" onClick={() => setDrafting(true)}>
            <Sparkles aria-hidden />
            Draft with AI
          </Button>
        )}
        <span className={sx(styles.footerSpacer)} />
        <span className={sx(styles.footerNote)} role="status">
          {!props.saved ? "Not saved yet" : dirty ? "Unsaved changes" : "Saved"}
        </span>
        <Button variant="quiet" size="sm" disabled={!dirty || !props.saved} onClick={props.onDiscard}>
          Discard
        </Button>
        <Button size="sm" disabled={!dirty} onClick={save}>
          Save playbook
        </Button>
      </footer>
    </div>
  );
}
