import { ipcMain } from "electron";
import { z } from "zod";
import { AutomationWebhookReceiverSettingsSchema } from "../../../src/lib/automation-webhooks";
import { WebhookEmptyArgsSchema, WebhookIdArgsSchema, WebhookTestArgsSchema, WebhookStatusResultSchema, WebhookProvisionResultSchema, WebhookTestResultSchema } from "../../../src/lib/automation-webhook-ipc";
import { configureWebhookReceiver, provisionWebhook, sendWebhookTest, webhookStatus } from "../automation-webhook-service";
export function registerAutomationWebhookHandlers() {
  function register<T extends z.ZodType, R extends z.ZodType>(channel:string,input:T,output:R,execute:(args:z.infer<T>)=>Promise<unknown>) {
    ipcMain.handle(channel,async (_event,args:unknown)=>{
      try { return output.parse(await execute(input.parse(args))); }
      catch { return output.parse({ok:false,message:"Webhook operation failed. Check receiver settings and saved automation."}); }
    });
  }
  register("automations:webhook-status",WebhookEmptyArgsSchema,WebhookStatusResultSchema,()=>webhookStatus());
  register("automations:webhook-configure",AutomationWebhookReceiverSettingsSchema,WebhookStatusResultSchema,configureWebhookReceiver);
  register("automations:webhook-provision",WebhookIdArgsSchema,WebhookProvisionResultSchema,({id})=>provisionWebhook(id));
  register("automations:webhook-test",WebhookTestArgsSchema,WebhookTestResultSchema,sendWebhookTest);
}
