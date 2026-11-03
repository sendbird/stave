import * as stylex from "@stylexjs/stylex";
import { Lock } from "lucide-react";
import { useId } from "react";
import { i18n, useTranslation } from "@/i18n";
import { StateMark } from "@/components/ads/components/StateMark";
import type { WorkState } from "@/components/ads/components/state-vocabulary";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import {
  describePresetActions,
  describePresetLocks,
  type PresetActionKind,
  type PresetActionNote,
  type PresetActionState,
  type ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import {
  agentModeClaudeGuardrails,
  type ClaudeGuardrailId,
  type ProviderId,
} from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import { useShallow } from "zustand/react/shallow";

const STATE_MARK: Readonly<Record<PresetActionState, WorkState>> = {
  own: "ready",
  sandbox: "ready",
  asks: "approval",
  flagged: "approval",
  off: "skipped",
};

function actionLabel(kind: PresetActionKind) {
  switch (kind) {
    case "read": return i18n.t("providers:presetActions.kind.read");
    case "edit": return i18n.t("providers:presetActions.kind.edit");
    case "command": return i18n.t("providers:presetActions.kind.command");
    case "web": return i18n.t("providers:presetActions.kind.web");
    case "mcp": return i18n.t("providers:presetActions.kind.mcp");
    case "tools": return i18n.t("providers:presetActions.kind.tools");
  }
}

function stateWord(state: PresetActionState) {
  switch (state) {
    case "own": return i18n.t("providers:presetActions.state.own");
    case "sandbox": return i18n.t("providers:presetActions.state.sandbox");
    case "asks": return i18n.t("providers:presetActions.state.asks");
    case "flagged": return i18n.t("providers:presetActions.state.flagged");
    case "off": return i18n.t("providers:presetActions.state.off");
  }
}

function noteText(note: PresetActionNote) {
  switch (note) {
    case "someFileCommands": return i18n.t("providers:presetActions.note.someFileCommands");
    case "beyondSandboxAsks": return i18n.t("providers:presetActions.note.beyondSandboxAsks");
  }
}

function lockLabel(id: ClaudeGuardrailId) {
  switch (id) {
    case "G1": return i18n.t("providers:presetActions.lock.writesOutsideRepository", { id });
    case "G2": return i18n.t("providers:presetActions.lock.credentials", { id });
    case "G3": return i18n.t("providers:presetActions.lock.remoteActions", { id });
  }
}

/**
 * What a permission preset does on its own and what it asks about first, one
 * row per kind of action, from `describePresetActions`. Under it, only for
 * Claude, the guardrails the user left on, which ask in Agent mode whatever
 * the preset. The rows are text with a state mark; nothing here is a control.
 */
export function PresetActionList(props: {
  providerId: ProviderId;
  providerLabel: string;
  presetId: ProviderModePresetId;
  presetLabel: string;
}) {
  useTranslation();
  const headingId = useId();
  const locksHeadingId = useId();
  // The guardrail switches are global settings; read them where they live.
  const guardrails = useAppStore(
    useShallow((state) => agentModeClaudeGuardrails(state.settings.claudeGuardrails)),
  );
  const actions = describePresetActions(props.providerId, props.presetId);
  const locks = describePresetLocks(props.providerId, guardrails);
  if (actions.length === 0) {
    return null;
  }
  return (
    <div className={sx(styles.root)} data-preset-actions={props.presetId}>
      <p className={sx(styles.heading)} id={headingId}>
        {i18n.t("providers:presetActions.heading", {
          preset: props.presetLabel,
          provider: props.providerLabel,
        })}
      </p>
      <ul aria-labelledby={headingId} className={sx(styles.list)}>
        {actions.map((action) => (
          <li className={sx(styles.row)} data-action={action.kind} data-state={action.state} key={action.kind}>
            <StateMark size="sm" state={STATE_MARK[action.state]} xstyle={styles.mark} />
            <span className={sx(styles.text)}>
              <span className={sx(styles.label)}>{actionLabel(action.kind)}</span>
              {action.note ? <span className={sx(styles.note)}>{noteText(action.note)}</span> : null}
            </span>
            <span className={sx(styles.word, action.state === "asks" && styles.wordAsks)}>
              {stateWord(action.state)}
            </span>
          </li>
        ))}
      </ul>
      {locks.length > 0 ? (
        <>
          <p className={sx(styles.heading)} id={locksHeadingId}>
            {i18n.t("providers:presetActions.locksHeading")}
          </p>
          <ul aria-labelledby={locksHeadingId} className={sx(styles.list)}>
            {locks.map((id) => (
              <li className={sx(styles.row)} data-lock={id} key={id}>
                <StateMark icon={Lock} size="sm" state="stopped" xstyle={styles.mark} />
                <span className={sx(styles.text)}>
                  <span className={sx(styles.label)}>{lockLabel(id)}</span>
                </span>
                <span className={sx(styles.word)}>{i18n.t("providers:presetActions.state.always")}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    minInlineSize: 0,
  },
  heading: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    margin: 0,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-4"],
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  // Mark on the first line of a label that may wrap under its note.
  row: {
    alignItems: "flex-start",
    display: "flex",
    gap: vars["--ads-space-8"],
    minInlineSize: 0,
  },
  mark: {
    flexShrink: 0,
  },
  text: {
    display: "flex",
    flex: "1 1 auto",
    flexDirection: "column",
    minInlineSize: 0,
  },
  label: {
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    overflowWrap: "anywhere",
  },
  note: {
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-normal"],
    overflowWrap: "anywhere",
  },
  word: {
    color: vars["--ads-color-text-muted"],
    flexShrink: 0,
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    whiteSpace: "nowrap",
  },
  wordAsks: {
    color: vars["--ads-color-warning-text"],
  },
});
