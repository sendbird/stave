import { i18n, useTranslation } from "@/i18n";
import { useState } from "react";
import { toast } from "@/components/ui";
import {
  previewSecretBinding,
  type PendingSecretRequest,
  type SecretRequestRespondResult,
  type SecretRequestResponse,
} from "@/lib/secrets/secret-request";
import {
  bindRequestedSecretToTask,
  useTaskBoundSecretIds,
  useTaskSecretRequests,
} from "@/store/secret-requests-store";
import { SecretRequestCard } from "./secret-request-card";

/**
 * Secrets the task's agent asked for with `stave_request_secret`, answered
 * from this task's composer. One card at a time, oldest first.
 */
export function SecretRequestSlot(props: { taskId: string }) {
  const requests = useTaskSecretRequests(props.taskId);
  const current = requests[0];
  if (!current) return null;
  return (
    <SecretRequestSlotCard
      key={current.id}
      taskId={props.taskId}
      request={current}
      queuedCount={requests.length - 1}
    />
  );
}

function describeFailure(result: SecretRequestRespondResult) {
  switch (result.reason) {
    case "not-pending":
      return i18n.t("session:secretRequestCard.errorNotPending");
    case "existing-missing":
      return i18n.t("session:secretRequestCard.errorExistingMissing");
    case "vault-error":
      return i18n.t("session:secretRequestCard.errorVault", { detail: result.message ?? "" });
    default:
      return i18n.t("session:secretRequestCard.errorInvalid");
  }
}

function SecretRequestSlotCard(props: {
  taskId: string;
  request: PendingSecretRequest;
  queuedCount: number;
}) {
  useTranslation();
  const { request } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boundSecretIds = useTaskBoundSecretIds(props.taskId);
  // With a saved secret, both answers bind its id; otherwise a new id.
  const bindingBlocked =
    previewSecretBinding(boundSecretIds, request.existingSecret?.id ?? null) === "at-cap";

  async function respond(response: SecretRequestResponse) {
    const api = window.api?.secretRequests;
    if (!api) {
      setError(i18n.t("session:secretRequestCard.errorUnavailable"));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api.respond(response).catch(
      (cause: unknown): SecretRequestRespondResult => ({
        ok: false,
        reason: "vault-error",
        message: cause instanceof Error ? cause.message : String(cause),
      }),
    );
    if (!result.ok) {
      setBusy(false);
      setError(describeFailure(result));
      return;
    }
    // On success main has already removed the request, so this card unmounts.
    if (result.secretId) {
      bindRequestedSecretToTask({ taskId: props.taskId, secretId: result.secretId });
      toast.success(i18n.t("session:secretRequestCard.toastSaved", { envVar: request.envVarName }), {
        description: i18n.t("session:secretRequestCard.toastSavedDescription"),
      });
    }
  }

  return (
    <SecretRequestCard
      request={request}
      queuedCount={props.queuedCount}
      busy={busy}
      error={error}
      bindingBlocked={bindingBlocked}
      onSave={(value) => void respond({ requestId: request.id, action: "save", value })}
      onUseExisting={() => void respond({ requestId: request.id, action: "use-existing" })}
      onDecline={() => void respond({ requestId: request.id, action: "decline" })}
    />
  );
}
