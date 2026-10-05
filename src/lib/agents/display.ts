import { i18n } from "@/i18n";

/** Built-in identities stay canonical in agent prompts; only their UI copy follows the display language. */
const BUILTIN_TEXT_KEYS = {
  "implementer": { name: "agents:builtins.implementer.name", description: "agents:builtins.implementer.description", avoidWhen: "agents:builtins.implementer.avoidWhen" },
  "lead": { name: "agents:builtins.lead.name", description: "agents:builtins.lead.description", avoidWhen: "agents:builtins.lead.avoidWhen" },
  "debugger": { name: "agents:builtins.debugger.name", description: "agents:builtins.debugger.description", avoidWhen: "agents:builtins.debugger.avoidWhen" },
  "ui-polisher": { name: "agents:builtins.uiPolisher.name", description: "agents:builtins.uiPolisher.description", avoidWhen: "agents:builtins.uiPolisher.avoidWhen" },
  "reviewer": { name: "agents:builtins.reviewer.name", description: "agents:builtins.reviewer.description", avoidWhen: "agents:builtins.reviewer.avoidWhen" },
  "researcher": { name: "agents:builtins.researcher.name", description: "agents:builtins.researcher.description", avoidWhen: "agents:builtins.researcher.avoidWhen" },
  "shipper": { name: "agents:builtins.shipper.name", description: "agents:builtins.shipper.description", avoidWhen: "agents:builtins.shipper.avoidWhen" },
  "patch-hand": { name: "agents:builtins.patchHand.name", description: "agents:builtins.patchHand.description" },
  "verified-patch": { name: "agents:builtins.verifiedPatch.name", description: "agents:builtins.verifiedPatch.description" },
  "sweep": { name: "agents:builtins.sweep.name", description: "agents:builtins.sweep.description" },
  "scout": { name: "agents:builtins.scout.name", description: "agents:builtins.scout.description" },
  "deep-packet": { name: "agents:builtins.deepPacket.name", description: "agents:builtins.deepPacket.description" },
  "second-pair": { name: "agents:builtins.secondPair.name", description: "agents:builtins.secondPair.description" },
} as const;

type DisplayAgent = { id: string; source?: string; name: string; description?: string; avoidWhen?: string };
function builtinKeys(agent: DisplayAgent) {
  return agent.source === "builtin" ? BUILTIN_TEXT_KEYS[agent.id as keyof typeof BUILTIN_TEXT_KEYS] : undefined;
}

export function getAgentDisplayName(agent: DisplayAgent): string {
  const keys = builtinKeys(agent);
  return keys ? i18n.t(keys.name) : agent.name;
}

export function getAgentDisplayDescription(agent: DisplayAgent): string {
  const keys = builtinKeys(agent);
  return keys ? i18n.t(keys.description) : agent.description ?? "";
}

export function getAgentDisplayAvoidWhen(agent: DisplayAgent): string | undefined {
  const keys = builtinKeys(agent);
  return keys && "avoidWhen" in keys ? i18n.t(keys.avoidWhen) : agent.avoidWhen;
}
