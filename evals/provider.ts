import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getDefaultModelForProvider } from "../src/lib/providers/model-catalog";
import type { EvalProvider } from "./runner";

/** Reuses utility inference's auth gate and tool-disabled, read-only runtimes. */
export async function createEvalProvider(provider: "claude" | "codex"): Promise<EvalProvider> {
  const providerId = provider === "claude" ? "claude-code" : "codex";
  const model = getDefaultModelForProvider({ providerId });
  let version = "unavailable";
  try { version = (await promisify(execFile)(provider, ["--version"], { timeout: 10_000, maxBuffer: 4096 })).stdout.trim(); }
  catch { /* Readiness reports a missing executable without running a model. */ }
  return {
    model, version,
    ready: async () => {
      try {
        const { defaultUtilityAuthGate } = await import("../electron/providers/utility-inference");
        return await defaultUtilityAuthGate({ providerId });
      } catch {
        return { ready: false, detail: "Provider credentials or runtime readiness could not be checked. Configure utility inference authentication and retry." };
      }
    },
    generate: async (prompt) => {
      const signal = AbortSignal.timeout(300_000);
      const response = provider === "claude"
        ? await (await import("../electron/providers/claude-sdk-runtime")).runClaudeReadOnlyPrompt({ prompt, model, signal, label: "Prompt evaluation" })
        : await (await import("../electron/providers/codex-app-server-runtime")).runCodexReadOnlyPrompt({ prompt, model, signal, isolated: true, toolsDisabled: true });
      if (!response.ok || !response.text) throw new Error(response.detail ?? "Provider returned no evaluation output.");
      return { text: response.text, model, version, cost: response.usage?.totalCostUsd };
    },
  };
}
