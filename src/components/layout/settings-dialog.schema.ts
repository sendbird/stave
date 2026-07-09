import {
  Bot,
  Cable,
  Code2,
  Cog,
  FileText,
  Folder,
  Globe,
  KeyRound,
  Network,
  Palette,
  Package2,
  ScrollText,
  SearchCheck,
  Shield,
  SlidersHorizontal,
  Sparkles,
  TerminalSquare,
  Wrench,
} from "lucide-react";

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
    label: "Scripts",
    icon: Sparkles,
    description: "Project automation, services, actions, and hooks.",
    keywords: [
      "quick commands",
      "commands",
      "automation",
      "service",
      "hooks",
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
      "fast mode",
    ],
  },
  {
    id: "providers",
    label: "Providers",
    icon: Wrench,
    description: "Claude and Codex provider runtime settings.",
    keywords: ["claude", "codex", "sandbox", "permission", "model", "effort"],
  },
  {
    id: "models",
    label: "Models",
    icon: Sparkles,
    description: "Model selection and routing preferences.",
    keywords: ["claude", "codex", "effort", "routing", "thinking"],
  },
  {
    id: "codex",
    label: "Codex",
    icon: Package2,
    description:
      "Codex app server status, extensions, threads, commands, and advanced config.",
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
    id: "subagents",
    label: "Subagents",
    icon: Network,
    description: "Subagent registry and delegation behavior.",
    keywords: ["agents", "delegate", "workers"],
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
        "codex",
        "mcp",
        "prompts",
        "skills",
        "subagents",
      ],
    },
    { label: "Interface", ids: ["commandPalette", "lens"] },
    { label: "System", ids: ["tooling", "developer", "changelog"] },
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
