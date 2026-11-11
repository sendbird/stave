import { z } from "zod";

export const BrowseConnectionStatusSchema = z.object({
  installed: z.boolean(),
  relay: z.enum(["running", "stopped"]),
  browsers: z.array(z.object({ id: z.string(), name: z.string() })),
  error: z.enum(["invalid-status", "status-failed"]).optional(),
});
export type BrowseConnectionStatus = z.infer<typeof BrowseConnectionStatusSchema>;

const StatusOutputSchema = z.object({
  relay: z.object({ running: z.boolean() }),
  extension: z.object({ browsers: z.array(z.unknown()).optional() }).nullable().optional(),
});
const BrowserSchema = z.object({ id: z.string().min(1), name: z.string().min(1), connected: z.boolean() });

export function parseBrowseStatus(stdout: string): BrowseConnectionStatus {
  try {
    const output = StatusOutputSchema.parse(JSON.parse(stdout));
    const browsers = (output.extension?.browsers ?? []).flatMap((entry) => {
      const parsed = BrowserSchema.safeParse(entry);
      return parsed.success && parsed.data.connected ? [{ id: parsed.data.id, name: parsed.data.name }] : [];
    });
    return { installed: true, relay: output.relay.running ? "running" : "stopped", browsers };
  } catch {
    return { installed: true, relay: "stopped", browsers: [], error: "invalid-status" };
  }
}
