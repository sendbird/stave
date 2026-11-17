import { expect, test } from "bun:test";
import { WebhookIdArgsSchema, WebhookTestArgsSchema, WebhookRunArgsSchema } from "../src/lib/automation-webhook-ipc";
test("webhook IPC rejects unknown keys and malformed ids at each boundary", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  expect(WebhookIdArgsSchema.safeParse({id}).success).toBe(true);
  expect(WebhookIdArgsSchema.safeParse({id,secret:"leak"}).success).toBe(false);
  expect(WebhookIdArgsSchema.safeParse({id:"../wrong"}).success).toBe(false);
  expect(WebhookTestArgsSchema.safeParse({id,body:'{"action":"opened"}'}).success).toBe(true);
  expect(WebhookTestArgsSchema.safeParse({id,body:"x".repeat(1048577)}).success).toBe(false);
  expect(WebhookRunArgsSchema.safeParse({id,payload:{action:"opened"}}).success).toBe(true);
  expect(WebhookRunArgsSchema.safeParse({id,payload:{},prompt:"override"}).success).toBe(false);
});

test("supervisor schedule snapshots retain webhook run triggers", async () => {
  const { TarsScheduleViewSchema } = await import("../src/lib/tars/schedules");
  expect(TarsScheduleViewSchema.shape.lastRun.safeParse({status:"completed",at:"2026-11-17T00:00:00.000Z",trigger:"webhook",taskId:"task",workspaceId:"workspace"}).success).toBe(true);
});
