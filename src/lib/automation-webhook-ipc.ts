import { z } from "zod";
import { AutomationWebhookReceiverSettingsSchema, AutomationWebhookDeliverySchema } from "./automation-webhooks";
export const WebhookIdArgsSchema = z.object({id:z.string().uuid()}).strict();
export const WebhookTestArgsSchema = WebhookIdArgsSchema.extend({body:z.string().max(1_048_576)}).strict();
export const WebhookRunArgsSchema = WebhookIdArgsSchema.extend({payload:z.json()}).strict();
export const WebhookEmptyArgsSchema = z.object({}).strict();
const Failure = z.object({ok:z.literal(false),message:z.string()}).strict();
export const WebhookStatusResultSchema = z.union([Failure,z.object({ok:z.literal(true),settings:AutomationWebhookReceiverSettingsSchema,deliveries:z.array(AutomationWebhookDeliverySchema)}).strict()]);
export const WebhookProvisionResultSchema = z.union([Failure,z.object({ok:z.literal(true),endpointId:z.string().regex(/^[a-f0-9]{64}$/),secretId:z.string().uuid(),url:z.string().url(),secret:z.string().min(1)}).strict()]);
export const WebhookTestResultSchema = z.union([Failure,z.object({ok:z.literal(true),status:z.number().int().min(100).max(599)}).strict()]);
export interface AutomationWebhookApi {
  webhookStatus: () => Promise<z.infer<typeof WebhookStatusResultSchema>>;
  configureWebhookReceiver: (args:z.infer<typeof AutomationWebhookReceiverSettingsSchema>) => Promise<z.infer<typeof WebhookStatusResultSchema>>;
  provisionWebhook: (args:z.infer<typeof WebhookIdArgsSchema>) => Promise<z.infer<typeof WebhookProvisionResultSchema>>;
  sendWebhookTest: (args:z.infer<typeof WebhookTestArgsSchema>) => Promise<z.infer<typeof WebhookTestResultSchema>>;
}
