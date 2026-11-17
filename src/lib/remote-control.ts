import { z } from "zod";
const Id = z.string().min(1).max(200);
export const RemoteConfigSchema = z.object({
    enabled: z.boolean(), address: z.string().min(1).max(80).default("127.0.0.1"), port: z.number().int().min(6500).max(6549).default(6500), confirmNetwork: z.boolean().default(false)
}).strict();
export const RemotePairSchema = z.object({
    code: z.string().regex(/^[a-f0-9]{32}$/), name: z.string().trim().min(1).max(80)
}).strict();
const Target = z.object({
    workspaceId: Id, taskId: Id, turnId: Id
}).strict();
export const RemoteActionSchema = z.discriminatedUnion("kind", [
    Target.extend({
        kind: z.literal("approval"), requestId: Id, messageId: Id, approved: z.boolean()
    }).strict(),
    Target.extend({
        kind: z.literal("question"), requestId: Id, messageId: Id, answers: z.record(z.string().min(1).max(4000), z.string().max(16000)).refine(v => Object.keys(v).length <= 12)
    }).strict(),
    Target.extend({
        kind: z.literal("stop")
    }).strict(),
]);
export type RemoteAction = z.infer<typeof RemoteActionSchema>;
export const RemoteResultSchema = z.object({
    ok: z.boolean(), reason: z.enum([
        "applied", "expired", "invalid", "unavailable"
    ])
}).strict();
export type RemoteResult = z.infer<typeof RemoteResultSchema>;
export const RemoteDeviceSchema = z.object({
    id: z.string().uuid(), name: z.string().min(1).max(80), lastSeen: z.number().int().nonnegative()
}).strict();
const RemoteAuditActionSchema = z.union([
    Target.extend({
        kind: z.literal("approval"), requestId: Id, messageId: Id, approved: z.boolean()
    }).strict(),
    Target.extend({
        kind: z.literal("question"), requestId: Id, messageId: Id
    }).strict(),
    Target.extend({
        kind: z.literal("stop")
    }).strict(),
]);
export const RemoteAuditSchema = z.object({
    id: z.string().uuid(), deviceId: z.string().uuid(), deviceName: z.string().max(80), time: z.number().int(), action: RemoteAuditActionSchema, result: RemoteResultSchema
}).strict();
export const RemoteTaskSchema = z.object({
    workspaceId: Id, taskId: Id, turnId: Id.nullable(), title: z.string().max(1000), updatedAt: z.string().max(100), running: z.boolean()
}).strict();
export const RemoteRequestSchema = Target.extend({
    kind: z.enum([
        "approval", "question"
    ]), requestId: Id, messageId: Id, summary: z.string().max(24000), questions: z.array(z.object({
        key: z.string().max(4000), question: z.string().max(4000), options: z.array(z.string().max(4000)).max(100)
    }).strict()).max(12)
}).strict();
export const RemoteSnapshotSchema = z.object({
    tasks: z.array(RemoteTaskSchema).max(200), requests: z.array(RemoteRequestSchema).max(200)
}).strict();
export const RemoteStatusSchema = z.object({
    enabled: z.boolean(), address: z.string(), port: z.number().int(), devices: z.array(RemoteDeviceSchema).max(32), audit: z.array(RemoteAuditSchema).max(100)
}).strict();
export const RemoteAdminSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("status")
    }).strict(), z.object({
        kind: z.literal("configure"), config: RemoteConfigSchema
    }).strict(), z.object({
        kind: z.literal("pair")
    }).strict(), z.object({
        kind: z.literal("revoke"), id: z.string().uuid().optional()
    }).strict()
]);
export const RemoteAdminResultSchema = z.object({
    status: RemoteStatusSchema, pairing: z.object({
        code: z.string(), url: z.string(), expiresAt: z.number()
    }).strict().optional()
}).strict();
export type RemoteAdmin = z.infer<typeof RemoteAdminSchema>;
export type RemoteAdminResult = z.infer<typeof RemoteAdminResultSchema>;
export interface RemoteControlApi {
    invoke(args: RemoteAdmin): Promise<RemoteAdminResult>;
}
