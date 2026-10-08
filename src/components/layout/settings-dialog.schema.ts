import {
  Bot,
  Brain,
  Cable,
  Code2,
  Cog,
  FileText,
  Folder,
  Gauge,
  Globe,
  KeyRound,
  ListTodo,
  Lock,
  Palette,
  Rocket,
  ScrollText,
  SearchCheck,
  Shield,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { getAppLocale, i18n, type I18nKey } from "@/i18n";
import { WORKSPACE_TOOLS_PRESENTATION } from "@/lib/workspace-tools-presentation";

/** A fully qualified key in the `settings` namespace. */
export type SettingsI18nKey = Extract<I18nKey, `settings:${string}`>;

/**
 * Section labels and descriptions are catalog keys so they follow the display
 * language: render them with `t(section.labelKey)`. `keywords` are extra
 * search aliases matched on top of the translated text.
 */

export const settingsSections = [
  {
    id: "general",
    labelKey: "settings:sections.general.label",
    icon: Cog,
    descriptionKey: "settings:sections.general.description",
    // The language picker lives here; "언어" lets a Korean UI find it even when
    // the query does not match the translated section copy.
    keywords: [
      "workspace",
      "sound",
      "notifications",
      "branch",
      "language",
      "locale",
      "언어",
      "developer mode",
      "diagnostics",
      "개발자 모드",
    ],
  },
  {
    id: "presets",
    labelKey: "settings:sections.presets.label",
    icon: SlidersHorizontal,
    descriptionKey: "settings:sections.presets.description",
    keywords: ["defaults", "templates", "profiles"],
  },
  {
    id: "macros",
    labelKey: "settings:sections.macros.label",
    icon: Zap,
    descriptionKey: "settings:sections.macros.description",
    keywords: [
      "snippet",
      "prompt",
      "shortcut",
      "insert",
      "instant",
      "run",
      "execute",
      "send",
    ],
  },
  {
    id: "projects",
    labelKey: "settings:sections.projects.label",
    icon: Folder,
    descriptionKey: "settings:sections.projects.description",
    keywords: ["repo", "repository", "root", "workspaces"],
  },
  {
    id: "scripts",
    labelKey: "settings:sections.scripts.label",
    icon: WORKSPACE_TOOLS_PRESENTATION.icon,
    descriptionKey: "settings:sections.scripts.description",
    keywords: [
      "quick commands",
      "commands",
      "processes",
      "service",
      "hooks",
      "scripts",
      "npm",
      "pnpm",
      "yarn",
    ],
  },
  {
    id: "theme",
    labelKey: "settings:sections.theme.label",
    icon: Palette,
    descriptionKey: "settings:sections.theme.description",
    keywords: ["appearance", "color", "dark", "light", "custom theme"],
  },
  {
    id: "chat",
    labelKey: "settings:sections.chat.label",
    icon: Bot,
    descriptionKey: "settings:sections.chat.description",
    keywords: [
      "task mode",
      "agentic",
      "agent",
      "experimental",
      "messages",
      "steer",
      "queue",
      "mid-turn",
      "reasoning",
      "interim",
      "conversation",
      "turn rail",
      "fast mode",
    ],
  },
  {
    id: "providers",
    labelKey: "settings:sections.providers.label",
    icon: Wrench,
    descriptionKey: "settings:sections.providers.description",
    keywords: [
      "claude",
      "codex",
      "cursor",
      "kiro",
      "sandbox",
      "permission",
      "approval",
      "approval preset",
      "auto approve",
      "trust all tools",
      "auto review",
      "model",
      "effort",
      "fast",
      "fable",
      "astra",
      "browser",
      "browser access",
      "chrome",
      "extension",
      "@web",
      // Delegation has no settings key of its own (its parameters are per
      // call), so the section keywords are the only way search can reach the
      // card that explains it.
      "delegation",
      "delegate",
      "delegated task",
      "child task",
      "worker",
      "usage",
      "limit",
      "credits",
      "overage",
      "100%",
    ],
  },
  {
    id: "models",
    labelKey: "settings:sections.models.label",
    icon: Sparkles,
    descriptionKey: "settings:sections.models.description",
    keywords: [
      "claude",
      "codex",
      "effort",
      "routing",
      "thinking",
      "model visibility",
      "hidden models",
      "show model",
      "hide model",
      "selector models",
    ],
  },
  {
    id: "autoRouting",
    labelKey: "settings:sections.autoRouting.label",
    icon: Sparkles,
    descriptionKey: "settings:sections.autoRouting.description",
    keywords: [
      "auto",
      "routing",
      "router",
      "model router",
      "stance",
      "cost saver",
      "quality first",
      "balanced",
      "role table",
      "rule",
      "budget guard",
      "usage",
      "eligible models",
      "allowed models",
      "level",
      "effort",
      "classifier",
      "dry run",
      "tester",
      "delegate",
      "price",
      "pricing",
    ],
  },
  {
    id: "mcp",
    labelKey: "settings:sections.mcp.label",
    icon: Cable,
    descriptionKey: "settings:sections.mcp.description",
    keywords: ["servers", "tools", "context"],
  },
  {
    id: "integrations",
    labelKey: "settings:sections.integrations.label",
    icon: Cable,
    descriptionKey: "settings:sections.integrations.description",
    keywords: [
      "crane",
      "atelier",
      "connector",
      "dispatch",
      "pair",
      "jira",
      "jira cloud",
      "site url",
      "jql",
      "api token",
      "issue tracker",
      "repository mapping",
    ],
  },
  {
    id: "issues",
    labelKey: "settings:sections.issues.label",
    icon: ListTodo,
    descriptionKey: "settings:sections.issues.description",
    keywords: [
      "tickets",
      "ticket",
      "tracker",
      "issues",
      "assigned",
      "kickoff",
      "start mode",
      "refresh",
      "poll",
      "backlog",
    ],
  },
  {
    id: "kickoff",
    labelKey: "settings:sections.kickoff.label",
    icon: Rocket,
    descriptionKey: "settings:sections.kickoff.description",
    keywords: ["workspace", "jira", "slack", "figma", "prd", "source"],
  },
  {
    id: "auxiliaryInference",
    labelKey: "settings:sections.auxiliaryInference.label",
    icon: Gauge,
    descriptionKey: "settings:sections.auxiliaryInference.description",
    keywords: [
      "background",
      "auxiliary",
      "aux",
      "cost",
      "spend",
      "credits",
      "tokens",
      "intent guard",
      "turn summary",
      "task name",
      "utility",
      "inline completion",
      "pre-pr review",
      "pr description",
    ],
  },
  {
    id: "prompts",
    labelKey: "settings:sections.prompts.label",
    icon: ScrollText,
    descriptionKey: "settings:sections.prompts.description",
    keywords: [
      "instructions",
      "templates",
      "system prompt",
      "review",
      "reviewer",
      "review skill",
      "second opinion",
    ],
  },
  {
    id: "memory",
    labelKey: "settings:sections.memory.label",
    icon: Brain,
    descriptionKey: "settings:sections.memory.description",
    keywords: ["memory", "remember", "forget", "candidate", "collection", "template", "reset"],
  },
  {
    id: "skills",
    labelKey: "settings:sections.skills.label",
    icon: SearchCheck,
    descriptionKey: "settings:sections.skills.description",
    keywords: ["catalog", "suggestions", "agents"],
  },
  {
    id: "commandPalette",
    labelKey: "settings:sections.commandPalette.label",
    icon: KeyRound,
    descriptionKey: "settings:sections.commandPalette.description",
    keywords: [
      "shortcuts",
      "hotkeys",
      "keyboard",
      "palette",
      "alt",
      "cmd",
      "ctrl",
    ],
  },
  {
    id: "terminal",
    labelKey: "settings:sections.terminal.label",
    icon: TerminalSquare,
    descriptionKey: "settings:sections.terminal.description",
    keywords: ["shell", "font", "cursor", "line height"],
  },
  {
    id: "editor",
    labelKey: "settings:sections.editor.label",
    icon: Code2,
    descriptionKey: "settings:sections.editor.description",
    keywords: ["font", "lsp", "eslint", "line numbers", "word wrap"],
  },
  {
    id: "tooling",
    labelKey: "settings:sections.tooling.label",
    icon: Shield,
    descriptionKey: "settings:sections.tooling.description",
    keywords: [
      "status",
      "dependencies",
      "doctor",
      "account",
      "sign in",
      "login",
      "gateway",
    ],
  },
  {
    id: "lens",
    labelKey: "settings:sections.lens.label",
    icon: Globe,
    descriptionKey: "settings:sections.lens.description",
    keywords: ["browser", "snapshot", "visual comment", "preview"],
  },
  {
    id: "secrets",
    labelKey: "settings:sections.secrets.label",
    icon: Lock,
    descriptionKey: "settings:sections.secrets.description",
    keywords: ["api", "token", "key", "credential", "password", "vault"],
  },
  {
    id: "developer",
    labelKey: "settings:sections.developer.label",
    icon: Wrench,
    descriptionKey: "settings:sections.developer.description",
    keywords: ["debug", "diagnostics", "binary", "runtime"],
  },
  {
    id: "changelog",
    labelKey: "settings:sections.changelog.label",
    icon: FileText,
    descriptionKey: "settings:sections.changelog.description",
    keywords: ["release", "updates", "versions"],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  labelKey: SettingsI18nKey;
  icon: LucideIcon;
  descriptionKey: SettingsI18nKey;
  keywords: readonly string[];
}>;

export type SectionId = (typeof settingsSections)[number]["id"];

export type SettingsSection = (typeof settingsSections)[number];

/** Sections that only show while Settings > General > Developer mode is on. */
const DEVELOPER_MODE_SECTION_IDS: ReadonlySet<SectionId> = new Set<SectionId>([
  "developer",
]);

export interface SettingsSectionVisibility {
  developerModeEnabled: boolean;
}

export function isSettingsSectionVisible(
  sectionId: SectionId,
  visibility: SettingsSectionVisibility,
) {
  return (
    visibility.developerModeEnabled || !DEVELOPER_MODE_SECTION_IDS.has(sectionId)
  );
}

export function listVisibleSettingsSections(
  visibility: SettingsSectionVisibility,
): SettingsSection[] {
  return settingsSections.filter((section) =>
    isSettingsSectionVisible(section.id, visibility),
  );
}

/**
 * Deep links (`openSettings({ section })`, the open-settings event) may name a
 * section the current profile hides; the dialog lands on General instead.
 */
export function resolveVisibleSettingsSection(
  sectionId: SectionId,
  visibility: SettingsSectionVisibility,
): SectionId {
  return isSettingsSectionVisible(sectionId, visibility) ? sectionId : "general";
}

export const settingsSectionGroups: Array<{
  labelKey: SettingsI18nKey;
  ids: SectionId[];
}> = [
  { labelKey: "settings:sections.groups.workspace", ids: ["general"] },
  {
    labelKey: "settings:sections.groups.appearance",
    ids: ["theme", "chat", "editor", "terminal"],
  },
  {
    labelKey: "settings:sections.groups.repositories",
    ids: ["projects", "scripts"],
  },
  {
    labelKey: "settings:sections.groups.aiAgents",
    ids: [
      "providers",
      "presets",
      "macros",
      "models",
      "autoRouting",
      "mcp",
      "integrations",
      "issues",
      "kickoff",
      "auxiliaryInference",
      "prompts",
      "memory",
      "skills",
    ],
  },
  {
    labelKey: "settings:sections.groups.interface",
    ids: ["commandPalette", "lens", "secrets"],
  },
  {
    labelKey: "settings:sections.groups.systemAdvanced",
    ids: ["tooling", "developer", "changelog"],
  },
];

/**
 * Lowercased search haystack for catalog-backed copy plus keyword aliases.
 *
 * Matches the active display language and English, so a Korean UI still finds
 * a setting by the English words people often type. Reads the shared i18n
 * instance at call time; callers that render the results subscribe with
 * `useTranslation` so a language change re-runs the search.
 */
export function buildSettingsSearchText(
  keys: readonly SettingsI18nKey[],
  keywords: readonly string[],
) {
  const includeEnglish = getAppLocale() !== "en";
  const parts: string[] = [];
  for (const key of keys) {
    parts.push(i18n.t(key));
    if (includeEnglish) {
      parts.push(i18n.t(key, { lng: "en" }));
    }
  }
  return [...parts, ...keywords].join(" ").toLowerCase();
}

export function getSettingsSectionSearchText(
  section: (typeof settingsSections)[number],
) {
  return buildSettingsSearchText(
    [section.labelKey, section.descriptionKey],
    section.keywords,
  );
}

export function matchesSettingsSection(
  section: (typeof settingsSections)[number],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const haystack = getSettingsSectionSearchText(section);
  return terms.every((term) => haystack.includes(term));
}
