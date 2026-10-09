import { i18n, useTranslation } from "@/i18n";
import { formatTime } from "@/i18n/format";
import { useId, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { MAX_BOUND_SECRETS } from "@/lib/secrets/secrets";
import type { PendingSecretRequest } from "@/lib/secrets/secret-request";
import { secretRequestCardStyles as styles } from "./secret-request-card.styles";

export interface SecretRequestCardProps {
  request: PendingSecretRequest;
  queuedCount: number;
  busy: boolean;
  error: string | null;
  /**
   * Binding would exceed the task's bound-secret cap. Both answers bind the
   * same id when a saved secret exists (a new value replaces it in place), so
   * one flag covers the card.
   */
  bindingBlocked: boolean;
  onSave: (value: string) => void;
  onUseExisting: () => void;
  onDecline: () => void;
  /** Start on the value field even when a saved secret exists (previews). */
  initialMode?: "existing" | "enter";
}

/**
 * Attributes that keep the browser and password-manager extensions from
 * offering to remember or fill this value: it belongs in the vault only.
 */
const UNSAVED_PASSWORD_FIELD_PROPS = {
  type: "password",
  name: "stave-secret-request-value",
  autoComplete: "new-password",
  autoCapitalize: "off",
  autoCorrect: "off",
  spellCheck: false,
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;

/**
 * The masked card an agent's `stave_request_secret` call shows in its task.
 * Presentation only: the value lives in this component's state until it is
 * handed to `onSave`, and nowhere else in the renderer.
 */
export function SecretRequestCard(props: SecretRequestCardProps) {
  useTranslation();
  const { request, busy } = props;
  const existing = request.existingSecret;
  const fieldId = useId();
  const [mode, setMode] = useState<"existing" | "enter">(
    existing ? (props.initialMode ?? "existing") : "enter",
  );
  const [value, setValue] = useState("");
  const showingExisting = Boolean(existing) && mode === "existing";
  const statusText = props.error
    ? props.error
    : busy
      ? i18n.t("session:secretRequestCard.saving")
      : props.bindingBlocked
        ? i18n.t("session:secretRequestCard.bindingFull", { max: MAX_BOUND_SECRETS })
        : i18n.t("session:secretRequestCard.waitingUntil", { time: formatTime(request.expiresAt) });

  const decline = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      xstyle={styles.action}
      disabled={busy}
      onClick={props.onDecline}
    >
      {i18n.t("session:secretRequestCard.decline")}
    </Button>
  );

  return (
    <section
      aria-label={i18n.t("session:secretRequestCard.ariaLabel")}
      className={sx(styles.section)}
      data-secret-request-id={request.id}
    >
      <div className={sx(styles.header)}>
        <KeyRound aria-hidden className={sx(styles.icon)} />
        <div className={sx(styles.headerBody)}>
          <div className={sx(styles.titleRow)}>
            <p className={sx(styles.title)}>{i18n.t("session:secretRequestCard.title")}</p>
            {props.queuedCount > 0 ? (
              <span className={sx(styles.queued)}>
                {i18n.t("session:secretRequestCard.queued", { count: props.queuedCount })}
              </span>
            ) : null}
          </div>
          <div className={sx(styles.variableRow)}>
            <code className={sx(styles.variable)}>${request.envVarName}</code>
            {request.label ? (
              <span className={sx(styles.label)} title={request.label}>
                {request.label}
              </span>
            ) : null}
          </div>
          <p className={sx(styles.reason)}>{request.reason}</p>
        </div>
      </div>

      {existing && showingExisting ? (
        <>
          <p className={sx(styles.existing)}>
            {i18n.t("session:secretRequestCard.existing")}{" "}
            <span className={sx(styles.existingName)}>{existing.name}</span>{" "}
            <span className={sx(styles.existingPreview)}>{existing.valuePreview || "••••"}</span>
          </p>
          <div className={sx(styles.actions)}>
            <Button
              type="button"
              size="sm"
              xstyle={styles.action}
              disabled={busy || props.bindingBlocked}
              onClick={props.onUseExisting}
            >
              {i18n.t("session:secretRequestCard.useExisting")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              xstyle={styles.action}
              disabled={busy}
              onClick={() => setMode("enter")}
            >
              {i18n.t("session:secretRequestCard.enterNew")}
            </Button>
            {decline}
          </div>
        </>
      ) : (
        <form
          className={sx(styles.form)}
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            if (!value || busy || props.bindingBlocked) return;
            props.onSave(value);
          }}
        >
          <label className={sx(styles.fieldLabel)} htmlFor={fieldId}>
            {i18n.t("session:secretRequestCard.valueLabel", { envVar: request.envVarName })}
            <Input
              {...UNSAVED_PASSWORD_FIELD_PROPS}
              id={fieldId}
              value={value}
              disabled={busy}
              placeholder={i18n.t("session:secretRequestCard.valuePlaceholder")}
              xstyle={styles.field}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          {existing ? (
            <p className={sx(styles.note)}>
              {i18n.t("session:secretRequestCard.replaceNote", { name: existing.name })}
            </p>
          ) : null}
          <div className={sx(styles.actions)}>
            <Button
              type="submit"
              size="sm"
              xstyle={styles.action}
              disabled={busy || !value || props.bindingBlocked}
            >
              {i18n.t("session:secretRequestCard.save")}
            </Button>
            {existing ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                xstyle={styles.action}
                disabled={busy}
                onClick={() => setMode("existing")}
              >
                {i18n.t("session:secretRequestCard.backToExisting")}
              </Button>
            ) : null}
            {decline}
          </div>
        </form>
      )}

      <p className={sx(styles.note)}>{i18n.t("session:secretRequestCard.availability")}</p>
      <p
        role={props.error ? "alert" : "status"}
        aria-live="polite"
        className={sx(styles.status, props.error ? styles.error : null)}
      >
        {statusText}
      </p>
    </section>
  );
}
