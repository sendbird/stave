import { z } from "zod";

export const ScriptTargetSchema = z.object({
  label: z.string().optional(),
  cwd: z.enum(["workspace", "project"]).optional(),
  env: z.record(z.string(), z.string()).optional(),
  shell: z.string().optional(),
});

export const ScriptOrbitSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().optional(),
  noTls: z.boolean().optional(),
  proxyPort: z.number().int().positive().optional(),
});

export const ScriptActionSchema = z.object({
  label: z.string().optional(),
  description: z.string().optional(),
  commands: z.array(z.string()).default([]),
  target: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
});

export const ScriptServiceSchema = ScriptActionSchema.extend({
  restartOnRun: z.boolean().optional(),
  orbit: ScriptOrbitSchema.optional(),
});

export const ScriptHookRefSchema = z.union([
  z.string(),
  z.object({
    ref: z.string(),
    kind: z.enum(["action", "service"]).optional(),
    blocking: z.boolean().optional(),
  }),
]);

export const ScriptHooksSchema = z.object({
  "task.created": z.array(ScriptHookRefSchema).optional(),
  "task.archiving": z.array(ScriptHookRefSchema).optional(),
  "turn.started": z.array(ScriptHookRefSchema).optional(),
  "turn.completed": z.array(ScriptHookRefSchema).optional(),
  "pr.beforeOpen": z.array(ScriptHookRefSchema).optional(),
  "pr.afterOpen": z.array(ScriptHookRefSchema).optional(),
});

export const ScriptsConfigSchema = z.object({
  version: z.literal(2),
  actions: z.record(z.string(), ScriptActionSchema).optional(),
  services: z.record(z.string(), ScriptServiceSchema).optional(),
  hooks: ScriptHooksSchema.optional(),
  targets: z.record(z.string(), ScriptTargetSchema).optional(),
});

export const ScriptsLocalConfigSchema = z.object({
  version: z.literal(2),
  actions: z.record(z.string(), ScriptActionSchema.partial()).optional(),
  services: z.record(z.string(), ScriptServiceSchema.partial()).optional(),
  hooks: ScriptHooksSchema.optional(),
  targets: z.record(z.string(), ScriptTargetSchema.partial()).optional(),
});
