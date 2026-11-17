import { app } from "electron";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { AutomationWebhookReceiverSettingsSchema } from "../../src/lib/automation-webhooks";
import { AutomationRunSchema } from "../../src/lib/automations";
import { WebhookRunArgsSchema } from "../../src/lib/automation-webhook-ipc";
import { createAutomationWebhookReceiver } from "../host-service/automation-webhook-receiver";
import { invokeHostService } from "./host-service-client";
import { listAutomations } from "./automation-service";
import { revealSecret, upsertSecret } from "./browser/secret-service";

let settings = AutomationWebhookReceiverSettingsSchema.parse({});
let receiver: ReturnType<typeof createAutomationWebhookReceiver> | undefined;
let mutation = Promise.resolve();
function settingsPath() { return path.join(app.getPath("userData"), "automation-webhook-settings.json"); }
function getReceiver() {
  return receiver ??= createAutomationWebhookReceiver({
    statePath:path.join(app.getPath("userData"), "automation-webhook-journal.json"),
    listAutomations: async () => (await listAutomations()).automations,
    resolveSecret: async (id) => (await revealSecret(id))?.value ?? null,
    runWebhook: async (args) => {
      const result = await invokeHostService("automation.invoke", {action:"run-webhook",args:WebhookRunArgsSchema.parse(args)});
      return AutomationRunSchema.parse(result);
    },
  });
}
export async function startAutomationWebhookReceiver() {
  try {
    settings = AutomationWebhookReceiverSettingsSchema.parse(JSON.parse(await readFile(settingsPath(), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("[webhooks] settings unavailable; receiver disabled");
    settings = AutomationWebhookReceiverSettingsSchema.parse({});
  }
  await getReceiver().start(settings);
}
export async function stopAutomationWebhookReceiver() { await receiver?.stop(); }
export async function webhookStatus() {
  return {ok:true as const,settings,deliveries:getReceiver().listDeliveries()};
}
export async function configureWebhookReceiver(input: unknown) {
  const next = AutomationWebhookReceiverSettingsSchema.parse(input);
  // Serialize listener replacement and its settings commit.
  const operation = mutation.then(async () => {
    await getReceiver().stop();
    try {
      await getReceiver().start(next);
      await mkdir(path.dirname(settingsPath()), {recursive:true});
      await writeFile(`${settingsPath()}.tmp`, JSON.stringify(next), {mode:0o600});
      await rename(`${settingsPath()}.tmp`,settingsPath());
      settings=next;
    } catch (error) {
      await getReceiver().stop();
      await getReceiver().start(settings);
      throw error;
    }
    return webhookStatus();
  });
  mutation=operation.then(()=>undefined,()=>undefined);
  return operation;
}
export async function provisionWebhook(id: string) {
  const endpointId=randomBytes(32).toString("hex");
  const secret=randomBytes(32).toString("hex");
  const stored=await upsertSecret({name:`Webhook ${id} ${endpointId.slice(0,8)}`,value:secret});
  const host=settings.bindAddress.includes(":")?`[${settings.bindAddress}]`:settings.bindAddress;
  return {ok:true as const,endpointId,secretId:stored.id,url:`http://${host}:${settings.port}/webhooks/${endpointId}`,secret};
}
export async function sendWebhookTest(args:{id:string;body:string}) {
  const payload:unknown=JSON.parse(args.body);
  const status=await getReceiver().sendTestEvent({id:args.id,payload});
  return {ok:true as const,status};
}
