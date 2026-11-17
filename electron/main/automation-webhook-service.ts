import { app } from "electron";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { AutomationWebhookReceiverSettingsSchema } from "../../src/lib/automation-webhooks";
import { AutomationRunSchema } from "../../src/lib/automations";
import { WebhookRunArgsSchema } from "../../src/lib/automation-webhook-ipc";
import { createAutomationWebhookReceiver } from "../host-service/automation-webhook-receiver";
import { invokeHostService } from "./host-service-client";
import { listAutomations, onAutomationWebhookSecretsDropped } from "./automation-service";
import { createWebhookSecretLedger } from "./automation-webhook-secrets";
import { deleteSecret, revealSecret, upsertSecret } from "./browser/secret-service";

let settings = AutomationWebhookReceiverSettingsSchema.parse({});
let receiver: ReturnType<typeof createAutomationWebhookReceiver> | undefined;
let mutation = Promise.resolve();
const processStartedAt = Date.now();
function settingsPath() { return path.join(app.getPath("userData"), "automation-webhook-settings.json"); }
function getReceiver() {
  return receiver ??= createAutomationWebhookReceiver({
    statePath: path.join(app.getPath("userData"), "automation-webhook-journal.json"),
    listAutomations: async () => (await listAutomations()).automations,
    resolveSecret: async (id) => (await revealSecret(id))?.value ?? null,
    runWebhook: async (args) => {
      const result = await invokeHostService("automation.invoke", {action: "run-webhook", args: WebhookRunArgsSchema.parse(args)});
      return AutomationRunSchema.parse(result);
    },
  });
}
let ledger: ReturnType<typeof createWebhookSecretLedger> | undefined;
let applyError: ReturnType<ReturnType<typeof createAutomationWebhookReceiver>["status"]>["error"] = null;
function secretLedger() {
  return ledger ??= createWebhookSecretLedger({
    registryPath: path.join(app.getPath("userData"), "automation-webhook-secrets.json"),
    listReferencedSecretIds: async () => new Set((await listAutomations()).automations.flatMap((automation) => automation.webhook ? [automation.webhook.secretId] : [])),
    deleteSecret,
  });
}
let reconciled: Promise<unknown> | null = null;
/** Secrets an editor provisioned before this launch and never saved; retried until the schedules can be read. */
function reconcileOnce() {
  reconciled ??= secretLedger().reconcile(processStartedAt).catch(() => { reconciled = null; });
}
// A schedule saved without its webhook, or deleted, no longer needs the signing secret.
onAutomationWebhookSecretsDropped((secretIds) => {
  void secretLedger().release(secretIds).catch(() => console.warn("[webhooks] an unused signing secret could not be removed"));
});

export async function startAutomationWebhookReceiver() {
  try {
    settings = AutomationWebhookReceiverSettingsSchema.parse(JSON.parse(await readFile(settingsPath(), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("[webhooks] settings unavailable; receiver disabled");
    settings = AutomationWebhookReceiverSettingsSchema.parse({});
  }
  reconcileOnce();
  // A bind failure stays visible in the receiver status the editor shows.
  await getReceiver().start(settings);
}
export async function stopAutomationWebhookReceiver() { await receiver?.stop(); }
export async function webhookStatus() {
  reconcileOnce();
  const current = getReceiver();
  const {settings: _settings, ...state} = current.status();
  return {ok: true as const, settings, receiver: {...state, applyError}, deliveries: current.listDeliveries(), rejections: current.listRejections()};
}
export async function configureWebhookReceiver(input: unknown) {
  const next = AutomationWebhookReceiverSettingsSchema.parse(input);
  // Serialize listener replacement and its settings commit.
  const operation = mutation.then(async () => {
    await getReceiver().stop();
    try {
      await getReceiver().start(next);
      await mkdir(path.dirname(settingsPath()), {recursive: true});
      await writeFile(`${settingsPath()}.tmp`, JSON.stringify(next), {mode: 0o600});
      await rename(`${settingsPath()}.tmp`, settingsPath());
      settings = next;
      applyError = null;
    } catch (error) {
      // The previous settings come back; why the new ones failed (for example a port in use) stays in the status.
      applyError = getReceiver().status().error ?? "bind-failed";
      await getReceiver().stop();
      await getReceiver().start(settings).catch(() => undefined);
      throw new Error("Webhook receiver settings were not applied.", {cause: error});
    }
    return webhookStatus();
  });
  mutation = operation.then(() => undefined, () => undefined);
  return operation;
}
export async function provisionWebhook(id: string) {
  const endpointId = randomBytes(32).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const stored = await upsertSecret({name: `Webhook ${id} ${endpointId.slice(0, 8)}`, value: secret});
  await secretLedger().track(stored.id);
  const host = settings.bindAddress.includes(":") ? `[${settings.bindAddress}]` : settings.bindAddress;
  return {ok: true as const, endpointId, secretId: stored.id, url: `http://${host}:${settings.port}/webhooks/${endpointId}`, secret};
}
/** The editor's unsaved secrets; one a saved schedule uses is kept. */
export async function releaseWebhookSecrets(args: {secretIds: string[]}) {
  return {ok: true as const, deleted: await secretLedger().release(args.secretIds)};
}
export async function sendWebhookTest(args: {id: string; body: string}) {
  const payload: unknown = JSON.parse(args.body);
  const status = await getReceiver().sendTestEvent({id: args.id, payload});
  return {ok: true as const, status};
}
