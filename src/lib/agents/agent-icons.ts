import {
  BookOpen,
  Binoculars,
  Bot,
  Brush,
  Bug,
  ClipboardCheck,
  Code,
  Compass,
  Eye,
  FileText,
  Flag,
  FlaskConical,
  GitBranch,
  GitPullRequest,
  Glasses,
  Hammer,
  Layers,
  Lightbulb,
  MessageSquare,
  Package,
  Paintbrush,
  ReplaceAll,
  Rocket,
  SearchCheck,
  ShieldCheck,
  Ship,
  Sparkles,
  Telescope,
  Terminal,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { i18n, type I18nKey } from "@/i18n/runtime";

/**
 * The icons an agent's avatar can show instead of its initials: one curated
 * set of lucide glyphs, grouped by the kind of work they suggest (build, test,
 * review, research, design, ship). Ids are lucide's own names, and the stored
 * value is the id alone (`AgentAppearance.icon`), so a glyph dropped from this
 * list later leaves the agent valid and its avatar falls back to initials.
 *
 * Renderer only: this module imports the icon components, so code shared with
 * the main process (`schema.ts`, `starters.ts`) refers to icons by id.
 */

export interface AgentIconEntry {
  id: string;
  icon: LucideIcon;
  labelKey: I18nKey;
}

export const AGENT_ICONS: readonly AgentIconEntry[] = [
  { id: "hammer", icon: Hammer, labelKey: "agents:agentIcons.hammer" },
  { id: "wrench", icon: Wrench, labelKey: "agents:agentIcons.wrench" },
  { id: "code", icon: Code, labelKey: "agents:agentIcons.code" },
  { id: "terminal", icon: Terminal, labelKey: "agents:agentIcons.terminal" },
  { id: "package", icon: Package, labelKey: "agents:agentIcons.package" },
  { id: "layers", icon: Layers, labelKey: "agents:agentIcons.layers" },
  { id: "workflow", icon: Workflow, labelKey: "agents:agentIcons.workflow" },
  { id: "replace-all", icon: ReplaceAll, labelKey: "agents:agentIcons.replaceAll" },
  { id: "bug", icon: Bug, labelKey: "agents:agentIcons.bug" },
  { id: "flask-conical", icon: FlaskConical, labelKey: "agents:agentIcons.flaskConical" },
  { id: "clipboard-check", icon: ClipboardCheck, labelKey: "agents:agentIcons.clipboardCheck" },
  { id: "shield-check", icon: ShieldCheck, labelKey: "agents:agentIcons.shieldCheck" },
  { id: "search-check", icon: SearchCheck, labelKey: "agents:agentIcons.searchCheck" },
  { id: "eye", icon: Eye, labelKey: "agents:agentIcons.eye" },
  { id: "glasses", icon: Glasses, labelKey: "agents:agentIcons.glasses" },
  { id: "message-square", icon: MessageSquare, labelKey: "agents:agentIcons.messageSquare" },
  { id: "telescope", icon: Telescope, labelKey: "agents:agentIcons.telescope" },
  { id: "binoculars", icon: Binoculars, labelKey: "agents:agentIcons.binoculars" },
  { id: "compass", icon: Compass, labelKey: "agents:agentIcons.compass" },
  { id: "book-open", icon: BookOpen, labelKey: "agents:agentIcons.bookOpen" },
  { id: "file-text", icon: FileText, labelKey: "agents:agentIcons.fileText" },
  { id: "lightbulb", icon: Lightbulb, labelKey: "agents:agentIcons.lightbulb" },
  { id: "paintbrush", icon: Paintbrush, labelKey: "agents:agentIcons.paintbrush" },
  { id: "brush", icon: Brush, labelKey: "agents:agentIcons.brush" },
  { id: "sparkles", icon: Sparkles, labelKey: "agents:agentIcons.sparkles" },
  { id: "rocket", icon: Rocket, labelKey: "agents:agentIcons.rocket" },
  { id: "ship", icon: Ship, labelKey: "agents:agentIcons.ship" },
  { id: "flag", icon: Flag, labelKey: "agents:agentIcons.flag" },
  { id: "git-branch", icon: GitBranch, labelKey: "agents:agentIcons.gitBranch" },
  { id: "git-pull-request", icon: GitPullRequest, labelKey: "agents:agentIcons.gitPullRequest" },
  { id: "bot", icon: Bot, labelKey: "agents:agentIcons.bot" },
];

const BY_ID = new Map(AGENT_ICONS.map((entry) => [entry.id, entry]));

/** The catalog entry for a stored id, or null when there is none (show initials). */
export function getAgentIcon(id: string | undefined): AgentIconEntry | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/** The icon's name in the display language, for its button label and tooltip. */
export function agentIconLabel(entry: AgentIconEntry): string {
  const t = i18n.t as unknown as (key: string) => string;
  return t(entry.labelKey);
}

/**
 * The icons whose label (in the display language) or id contains every word of
 * the query, in catalog order. Ids are English words, so an English search
 * still finds an icon while the UI is in another language.
 */
export function matchAgentIcons(query: string): AgentIconEntry[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...AGENT_ICONS];
  return AGENT_ICONS.filter((entry) => {
    const haystack = `${agentIconLabel(entry)} ${entry.id.replace(/-/g, " ")}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
