import {
  Bot,
  Cable,
  Code2,
  Cog,
  FileText,
  Folder,
  Globe,
  KeyRound,
  Lock,
  Palette,
  Package2,
  Rocket,
  ScrollText,
  SearchCheck,
  Shield,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import { WORKSPACE_TOOLS_PRESENTATION } from "@/lib/workspace-tools-presentation";

export const settingsSections = [
  {
    id: "general",
    label: "General",
    icon: Cog,
    description: "Workspace defaults, notifications, and app behavior.",
    keywords: ["workspace", "sound", "notifications", "branch"],
  },
  {
    id: "presets",
    label: "Presets",
    icon: SlidersHorizontal,
    description: "Reusable prompt and provider presets.",
    keywords: ["defaults", "templates", "profiles"],
  },
  {
    id: "projects",
    label: "Projects",
    icon: Folder,
    description: "Project-level paths, setup prompts, and workspace defaults.",
    keywords: ["repo", "repository", "root", "workspaces"],
  },
  {
    id: "scripts",
    label: WORKSPACE_TOOLS_PRESENTATION.label,
    icon: WORKSPACE_TOOLS_PRESENTATION.icon,
    description:
      "One-shot commands, long-running processes, lifecycle triggers, and execution environments.",
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
    label: "Design",
    icon: Palette,
    description: "Theme, color, and visual styling.",
    keywords: ["appearance", "color", "dark", "light", "custom theme"],
  },
  {
    id: "chat",
    label: "Chat",
    icon: Bot,
    description:
      "Chat typography, streaming, reasoning, and active-turn behavior.",
    keywords: [
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
    label: "Providers",
    icon: Wrench,
    description: "Claude, Codex, Cursor, and Kiro provider runtime settings.",
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
      "advisor",
      "consult",
      "on demand",
      "fable",
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
      "child task",
      "worker",
    ],
  },
  {
    id: "models",
    label: "Models",
    icon: Sparkles,
    description: "Model selection, visibility, and routing preferences.",
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
    id: "codex",
    label: "Codex Inspector",
    icon: Package2,
    description:
      "Advanced App Server, plugin, thread, command, and config diagnostics.",
    keywords: [
      "app server",
      "plugins",
      "threads",
      "slash commands",
      "json",
      "config",
    ],
  },
  {
    id: "mcp",
    label: "MCP",
    icon: Cable,
    description: "Model Context Protocol servers and runtime status.",
    keywords: ["servers", "tools", "context"],
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: Cable,
    description: "Personal outbound connectors and external task sources.",
    keywords: ["crane", "atelier", "connector", "dispatch", "pair"],
  },
  {
    id: "kickoff",
    label: "Kickoff",
    icon: Rocket,
    description: "External source matching and workspace proposal settings.",
    keywords: ["workspace", "jira", "slack", "figma", "prd", "source"],
  },
  {
    id: "prompts",
    label: "Prompts",
    icon: ScrollText,
    description: "Default prompt text and response instructions.",
    keywords: ["instructions", "templates", "system prompt"],
  },
  {
    id: "skills",
    label: "Skills",
    icon: SearchCheck,
    description: "Skill discovery and prompt input suggestions.",
    keywords: ["catalog", "suggestions", "agents"],
  },
  {
    id: "commandPalette",
    label: "Command Palette",
    icon: KeyRound,
    description:
      "Global command launcher, shell shortcut chords, and model hotkeys.",
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
    label: "Terminal",
    icon: TerminalSquare,
    description: "Integrated terminal typography and cursor behavior.",
    keywords: ["shell", "font", "cursor", "line height"],
  },
  {
    id: "editor",
    label: "Editor",
    icon: Code2,
    description: "Editor typography, display, and language tooling.",
    keywords: ["font", "lsp", "eslint", "line numbers", "word wrap"],
  },
  {
    id: "tooling",
    label: "Tooling",
    icon: Shield,
    description: "Local tool health and install checks.",
    keywords: ["status", "dependencies", "doctor"],
  },
  {
    id: "lens",
    label: "Lens",
    icon: Globe,
    description: "Browser Lens sessions and visual comment capture.",
    keywords: ["browser", "snapshot", "visual comment", "preview"],
  },
  {
    id: "secrets",
    label: "Secrets",
    icon: Lock,
    description: "Encrypted API tokens and other secret values.",
    keywords: ["api", "token", "key", "credential", "password", "vault"],
  },
  {
    id: "developer",
    label: "Developer",
    icon: Wrench,
    description: "Developer diagnostics and internal runtime toggles.",
    keywords: ["debug", "diagnostics", "binary", "runtime"],
  },
  {
    id: "changelog",
    label: "Changelog",
    icon: FileText,
    description: "Release notes and product changes.",
    keywords: ["release", "updates", "versions"],
  },
] as const;

export type SectionId = (typeof settingsSections)[number]["id"];

export const settingsSectionGroups: Array<{ label: string; ids: SectionId[] }> =
  [
    { label: "Workspace", ids: ["general"] },
    { label: "Appearance", ids: ["theme", "chat", "editor", "terminal"] },
    { label: "Projects", ids: ["projects", "scripts"] },
    {
      label: "AI & Agents",
      ids: [
        "providers",
        "presets",
        "models",
        "mcp",
        "integrations",
        "kickoff",
        "prompts",
        "skills",
      ],
    },
    { label: "Interface", ids: ["commandPalette", "lens", "secrets"] },
    {
      label: "System & Advanced",
      ids: ["tooling", "codex", "developer", "changelog"],
    },
  ];

export function getSettingsSectionSearchText(
  section: (typeof settingsSections)[number],
) {
  return [section.label, section.description, ...section.keywords]
    .join(" ")
    .toLowerCase();
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
