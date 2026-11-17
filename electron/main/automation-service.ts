import type { HostAutomationAction } from "../host-service/protocol";
import type {
  AutomationInformationResourceCreateInput,
  AutomationRun,
  AutomationSnapshot,
  AutomationSpec,
  AutomationUpsertInput,
} from "../../src/lib/automations";
import {
  buildWorkspaceInformationReferenceOptions,
  type WorkspaceInformationReferenceOption,
  type WorkspaceInformationReferenceSection,
} from "../../src/lib/workspace-information-references";
import type { WorkspaceInformationState } from "../../src/lib/workspace-information";
import { setUnattendedAutomationAuthorizations } from "./browser/browser-security";
import {
  invokeHostService,
  onHostServiceDisconnect,
  onHostServiceEvent,
} from "./host-service-client";
import {
  addWorkspaceCustomField,
  addWorkspaceResource,
  addWorkspaceTodo,
  appendWorkspaceNotes,
} from "./stave-mcp-service";

let automationEventBridgeRegistered = false;

/**
 * Keeps the main process aware of in-flight unattended runs. Security gates that
 * would otherwise prompt the renderer (Lens CDP host access) need this because
 * the MCP tool call itself carries no automation identity.
 */
function ensureAutomationEventBridge() {
  if (automationEventBridgeRegistered) {
    return;
  }
  automationEventBridgeRegistered = true;
  setUnattendedAutomationAuthorizations([]);
  onHostServiceEvent(
    "automation.unattended-authorizations-changed",
    ({ authorizations }) => {
      setUnattendedAutomationAuthorizations(authorizations);
    },
  );
  onHostServiceDisconnect(() => {
    setUnattendedAutomationAuthorizations([]);
  });
}

ensureAutomationEventBridge();

async function invokeAutomation<TResult>(
  action: HostAutomationAction,
  args: unknown,
) {
  ensureAutomationEventBridge();
  return invokeHostService("automation.invoke", {
    action,
    args,
  }, action === "list" ? { timeoutMs: 15_000 } : undefined) as Promise<TResult>;
}

export function listAutomations() {
  return invokeAutomation<AutomationSnapshot>("list", {});
}

export function createAutomation(input: AutomationUpsertInput) {
  return invokeAutomation<AutomationSpec>("create", input);
}

type WebhookSecretsDroppedListener = (secretIds: string[]) => void;
const webhookSecretsDroppedListeners = new Set<WebhookSecretsDroppedListener>();

/** Called with the webhook signing secrets a saved change stopped using (trigger switched off or replaced, schedule deleted). */
export function onAutomationWebhookSecretsDropped(listener: WebhookSecretsDroppedListener) {
  webhookSecretsDroppedListeners.add(listener);
  return () => { webhookSecretsDroppedListeners.delete(listener); };
}

async function webhookSecretOf(id: string) {
  try {
    return (await listAutomations()).automations.find((automation) => automation.id === id)?.webhook?.secretId ?? null;
  } catch {
    return null;
  }
}

function notifyWebhookSecretDropped(previous: string | null, next: string | null | undefined) {
  if (!previous || previous === next) return;
  for (const listener of webhookSecretsDroppedListeners) listener([previous]);
}

export async function updateAutomation(args: { id: string; input: AutomationUpsertInput }) {
  const previous = await webhookSecretOf(args.id);
  const saved = await invokeAutomation<AutomationSpec>("update", args);
  notifyWebhookSecretDropped(previous, saved.webhook?.secretId);
  return saved;
}

export async function removeAutomation(args: { id: string }) {
  const previous = await webhookSecretOf(args.id);
  const removed = await invokeAutomation<{ ok: true; id: string }>("remove", args);
  notifyWebhookSecretDropped(previous, null);
  return removed;
}

export function setAutomationEnabled(args: { id: string; enabled: boolean }) {
  return invokeAutomation<AutomationSpec>("set-enabled", args);
}

export function setAutomationProviderTimeoutMs(args: {
  providerTimeoutMs: number;
}) {
  return invokeAutomation<void>("set-provider-timeout", args);
}

export function runAutomationNow(args: { id: string; payload?: unknown }) {
  return invokeAutomation<AutomationRun>("run-now", args);
}

export function listAutomationInformationReferences(args: {
  workspaceId: string;
}) {
  return invokeAutomation<WorkspaceInformationReferenceOption[]>(
    "list-information-references",
    args,
  );
}

function requireInformationReference(args: {
  workspaceInformation: WorkspaceInformationState;
  section: WorkspaceInformationReferenceSection;
  itemId?: string;
}) {
  const option = buildWorkspaceInformationReferenceOptions(
    args.workspaceInformation,
  ).find(
    (candidate) =>
      candidate.reference.section === args.section &&
      (args.itemId
        ? candidate.reference.scope === "item" &&
          candidate.reference.itemId === args.itemId
        : candidate.reference.scope === "section"),
  );
  if (!option) {
    throw new Error("Created Information resource reference was not found.");
  }
  return option;
}

export async function createAutomationInformationResource(
  input: AutomationInformationResourceCreateInput,
) {
  if (input.kind === "notes") {
    const result = await appendWorkspaceNotes({
      workspaceId: input.workspaceId,
      text: input.text,
    });
    return {
      option: requireInformationReference({
        workspaceInformation: result.workspaceInformation,
        section: "notes",
      }),
      deduplicated: false,
    };
  }

  if (input.kind === "todo") {
    const result = await addWorkspaceTodo({
      workspaceId: input.workspaceId,
      text: input.text,
    });
    const todoId = result.workspaceInformation.todos.at(-1)?.id;
    if (!todoId) {
      throw new Error("Created Information todo was not found.");
    }
    return {
      option: requireInformationReference({
        workspaceInformation: result.workspaceInformation,
        section: "todo",
        itemId: todoId,
      }),
      deduplicated: false,
    };
  }

  if (input.kind === "custom") {
    const result = await addWorkspaceCustomField({
      workspaceId: input.workspaceId,
      fieldType: input.fieldType,
      label: input.label,
      value: input.value,
      options: input.options,
    });
    const fieldId = result.workspaceInformation.customFields.at(-1)?.id;
    if (!fieldId) {
      throw new Error("Created Information custom field was not found.");
    }
    return {
      option: requireInformationReference({
        workspaceInformation: result.workspaceInformation,
        section: "custom",
        itemId: fieldId,
      }),
      deduplicated: false,
    };
  }

  const result = await addWorkspaceResource(input);
  return {
    option: requireInformationReference({
      workspaceInformation: result.workspaceInformation,
      section: input.kind === "pull_request" ? "pr" : input.kind,
      itemId: result.resource.id,
    }),
    deduplicated: result.deduplicated,
  };
}
