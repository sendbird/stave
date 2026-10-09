/**
 * The model of every turn the host starts for an agent run (the first stage
 * turn, continuations, the nudge, a resume after restart). Same precedence as
 * the composer's Agent-mode sends: a pin > the agent's fixed model > Stave
 * Auto with the agent's task class. The task's prompt draft carries the pin
 * and the Auto choice (`src/lib/agents/selector-choice.ts`); the agent
 * snapshot carries the fixed model and the task class.
 *
 * Classification runs per turn, through a `RouteClassifier` port the host
 * fills with in-process utility inference.
 *
 * Used by: `electron/host-service/supervision/agent-run-host.ts` (routing) and
 * `src/lib/agents/useAgentSync.ts` (the synced settings).
 */
import { z } from "zod";
import { fixedModelOf, resolveAgentModelRoute, type AgentModelRoute } from "@/lib/agents/selector-choice";
import type { AgentConfig } from "@/lib/agents/schema";
import { AgentRunRouteSelectionSchema, type AgentRunRouteSelection } from "@/lib/agent-runs/route-observation";
import { validateProfile } from "@/lib/providers/auto-routing-profile";
import { getDefaultModelForProvider, inferProviderIdFromModel } from "@/lib/providers/model-catalog";
import type { ProviderId, ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import { boundRouteIntentInput, RouteIntentResultSchema } from "@/lib/providers/route-intent";
import type { RouteClassificationRequest, UtilityInferenceContext } from "@/lib/providers/utility-inference";
import type { PromptDraftRuntimeOverrides } from "@/types/chat";
import {
  resolveAutoRoutingDecision,
  routeEffortOverrides,
  type AutoRoutingHistoryMessage,
  type RouteClassifier,
} from "./auto-routing";
// temporary-migration: auto-routing-v1-settings-keys
import { AUTO_ROUTING_V1_SETTINGS_KEYS, withoutAutoRoutingV1Keys } from "./auto-routing-v1-settings-migration";
// end temporary-migration: auto-routing-v1-settings-keys

// temporary-migration: auto-routing-v1-settings-keys
const LEGACY_V1_ROUTING_FIELDS = Object.fromEntries(
  AUTO_ROUTING_V1_SETTINGS_KEYS.map((key) => [key, z.unknown().optional()]),
) as Record<(typeof AUTO_ROUTING_V1_SETTINGS_KEYS)[number], z.ZodOptional<z.ZodUnknown>>;
// end temporary-migration: auto-routing-v1-settings-keys
const BinaryPathSchema = z.string().max(4_096).optional();

const ClassifierContextSchema = z
  .object({
    utilityProviderId: z.enum(["auto", "claude-code", "codex"]).optional(),
    utilityModel: z.string().trim().max(200).optional(),
    utilityMaxProviderAttempts: z.number().int().min(1).max(8).optional(),
    runtimeOptions: z
      .object({
        claudeBinaryPath: BinaryPathSchema,
        codexBinaryPath: BinaryPathSchema,
        cursorBinaryPath: BinaryPathSchema,
        kiroBinaryPath: BinaryPathSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * The user's Stave Auto settings as the host keeps them. The renderer owns
 * settings and syncs this copy with the agents (`agents:sync`); the host
 * persists it so a run that resumes after a restart routes the same way.
 */
export const AgentRouteSettingsSchema = z
  .object({
    routing: z
      .object({
        autoRoutingEnabled: z.boolean(),
        autoRoutingProfile: z.unknown().optional(),
        // temporary-migration: auto-routing-v1-settings-keys
        // A host copy saved before the v1 keys were retired still parses.
        ...LEGACY_V1_ROUTING_FIELDS,
        // end temporary-migration: auto-routing-v1-settings-keys
      })
      .strict()
      .transform((routing) => {
        // temporary-migration: auto-routing-v1-settings-keys
        const current = withoutAutoRoutingV1Keys(routing) as { autoRoutingProfile?: unknown };
        // end temporary-migration: auto-routing-v1-settings-keys
        return {
          autoRoutingEnabled: routing.autoRoutingEnabled,
          autoRoutingProfile:
            current.autoRoutingProfile === undefined ? undefined : validateProfile(current.autoRoutingProfile),
        };
      }),
    /** The utility classifier's context, by the provider a turn runs on; null when classification is off. */
    classifier: z
      .object({ "claude-code": ClassifierContextSchema.optional(), codex: ClassifierContextSchema.optional() })
      .strict()
      .nullable(),
  })
  .strict();
export type AgentRouteSettings = z.output<typeof AgentRouteSettingsSchema>;
export type AgentRouteSettingsInput = z.input<typeof AgentRouteSettingsSchema>;
export type AgentRouteClassifierContext = z.output<typeof ClassifierContextSchema>;

export interface AgentTurnRoute {
  providerId: ProviderId;
  model: string;
  /** The route's effort; empty when the user's effort setting applies. */
  runtimeOptions: Pick<ProviderRuntimeOptions, "claudeEffort" | "codexReasoningEffort">;
  /** `task-model`: nothing routes (Stave Auto off, no pin, no fixed model). */
  route: AgentModelRoute | "task-model";
  rationale: string;
  selection: AgentRunRouteSelection | null;
}

function draftEffort(
  draft: PromptDraftRuntimeOverrides,
  providerId: ProviderId,
): AgentTurnRoute["runtimeOptions"] {
  if (providerId === "claude-code" && draft.claudeEffort) return { claudeEffort: draft.claudeEffort };
  if (providerId === "codex" && draft.codexReasoningEffort) return { codexReasoningEffort: draft.codexReasoningEffort };
  return {};
}

/**
 * Routes one host-started turn of an agent run. Never throws for a classifier
 * that fails: Stave Auto falls back to its local rules, as in the composer.
 */
export async function routeAgentRunTurn(args: {
  agent: Pick<AgentConfig, "model"> | null;
  /** The task's prompt draft overrides: the composer's route for this task. */
  draft: PromptDraftRuntimeOverrides | null | undefined;
  current: { providerId: ProviderId; model: string };
  settings: AgentRouteSettings | null;
  prompt: string;
  history: readonly AutoRoutingHistoryMessage[];
  classifyRoute?: RouteClassifier;
  signal?: AbortSignal;
}): Promise<AgentTurnRoute> {
  args.signal?.throwIfAborted();
  const draft = args.draft ?? {};
  const fixed = args.agent ? fixedModelOf(args.agent) : null;
  const draftModel = draft.model?.trim();
  const observed = (
    route: Omit<AgentTurnRoute, "selection">,
    source: AgentRunRouteSelection["source"],
    effortSource: AgentRunRouteSelection["effortSource"],
  ): AgentTurnRoute => {
    const requestedEffort = (route.providerId === "claude-code" ? route.runtimeOptions.claudeEffort
      : route.providerId === "codex" ? route.runtimeOptions.codexReasoningEffort : undefined) ?? null;
    const selection = AgentRunRouteSelectionSchema.safeParse({
      version: 1, source, previous: args.current,
      selected: { providerId: route.providerId, model: route.model },
      requestedEffort, effortSource: requestedEffort ? effortSource : "unspecified",
      inputs: { quota: "not-provided", catalog: "not-provided", availability: "not-provided" },
    });
    // Observation must never reject an otherwise valid existing route.
    return { ...route, selection: selection.success ? selection.data : null };
  };
  // 1. A model in the draft: the user's pin, or the agent's fixed model the selector moved to.
  if (draftModel) {
    const providerId = draft.modelProviderId ?? inferProviderIdFromModel({ model: draftModel });
    const route = resolveAgentModelRoute({ fixed, autoRouting: false, providerId, model: draftModel });
    return observed({
      providerId,
      model: draftModel,
      runtimeOptions: draftEffort(draft, providerId),
      route,
      rationale: route === "pinned" ? "Pinned in the composer." : "The agent's fixed model.",
    }, route === "pinned" ? "pinned" : "agent-fixed", "draft");
  }
  // 2. The agent's fixed model outranks Stave Auto.
  if (fixed && args.agent?.model.mode === "fixed") {
    const model =
      fixed.model ??
      (fixed.providerId === args.current.providerId
        ? args.current.model
        : getDefaultModelForProvider({ providerId: fixed.providerId }));
    return observed({
      providerId: fixed.providerId,
      model,
      runtimeOptions: routeEffortOverrides({ providerId: fixed.providerId, model, effort: args.agent.model.effort }),
      route: "agent-fixed",
      rationale: "The agent's fixed model.",
    }, "agent-fixed", "agent");
  }
  // 3. Stave Auto with the agent's task class, when the task is on Auto.
  if (draft.autoRouting === true && args.settings?.routing.autoRoutingEnabled) {
    const taskClassHint = args.agent?.model.mode === "auto" ? args.agent.model.taskClass : undefined;
    const decision = await resolveAutoRoutingDecision({
      settings: args.settings.routing,
      runtimeOverrides: draft,
      currentProviderId: args.current.providerId,
      currentModel: args.current.model,
      prompt: args.prompt,
      history: args.history,
      phase: "execute",
      signal: args.signal,
      ...(taskClassHint ? { taskClassHint } : {}),
      ...(args.classifyRoute ? { classifyRoute: args.classifyRoute } : {}),
    });
    return observed({
      providerId: decision.providerId,
      model: decision.model,
      runtimeOptions: {
        ...(decision.providerId === "claude-code" && decision.claudeEffort ? { claudeEffort: decision.claudeEffort } : {}),
        ...(decision.providerId === "codex" && decision.codexReasoningEffort
          ? { codexReasoningEffort: decision.codexReasoningEffort }
          : {}),
      },
      route: "auto",
      rationale: decision.rationale,
    }, decision.source, "auto");
  }
  // 4. Nothing routes: the turn runs on the task's model, as a composer send would.
  return observed({
    providerId: args.current.providerId,
    model: args.current.model,
    runtimeOptions: {},
    route: "task-model",
    rationale: "Stave Auto is off for this task.",
  }, "task-model", "unspecified");
}

/**
 * The host's classifier port: utility inference in process, with the synced
 * context for the provider the task runs on. Any failure is "no answer".
 */
export function createAgentRouteClassifier(args: {
  context: AgentRouteClassifierContext & Pick<UtilityInferenceContext, "cwd" | "activeProviderId">;
  classify: (request: RouteClassificationRequest) => Promise<{ ok: boolean; classification?: unknown }>;
}): RouteClassifier {
  return async (request, signal) => {
    if (signal?.aborted) return null;
    try {
      const result = await args.classify({ ...args.context, ...boundRouteIntentInput(request) });
      if (signal?.aborted || !result.ok) return null;
      const parsed = RouteIntentResultSchema.safeParse(result.classification);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };
}

/** The routing history of a task's saved messages, newest last; unreadable entries are skipped. */
export function toRoutingHistory(messages: readonly unknown[]): AutoRoutingHistoryMessage[] {
  return messages.flatMap((message): AutoRoutingHistoryMessage[] => {
    if (!message || typeof message !== "object") return [];
    const { role, content, providerId, model } = message as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return [];
    return [
      {
        role,
        content,
        ...(providerId === "claude-code" || providerId === "codex" ? { providerId } : {}),
        ...(typeof model === "string" && model ? { model } : {}),
      },
    ];
  });
}
