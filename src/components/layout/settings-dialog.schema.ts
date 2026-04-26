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
  { id: "general", label: "General", icon: Cog },
  { id: "presets", label: "Presets", icon: SlidersHorizontal },
  { id: "projects", label: "Projects", icon: Folder },
  { id: "theme", label: "Design", icon: Palette },
  { id: "chat", label: "Chat", icon: Bot },
  { id: "muse", label: "Muse", icon: Sparkles },
  { id: "providers", label: "Providers", icon: Wrench },
  { id: "codex", label: "Codex", icon: Package2 },
  { id: "mcp", label: "MCP", icon: Cable },
  { id: "prompts", label: "Prompts", icon: ScrollText },
  { id: "skills", label: "Skills", icon: SearchCheck },
  { id: "subagents", label: "Subagents", icon: Network },
  { id: "commandPalette", label: "Command Palette", icon: KeyRound },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "editor", label: "Editor", icon: Code2 },
  { id: "tooling", label: "Tooling", icon: Shield },
  { id: "lens", label: "Lens", icon: Globe },
  { id: "developer", label: "Developer", icon: Wrench },
  { id: "changelog", label: "Changelog", icon: FileText },
] as const;

export type SectionId = (typeof settingsSections)[number]["id"];

export const settingsSectionGroups: Array<{ label: string; ids: SectionId[] }> =
  [
    { label: "Workspace", ids: ["general", "presets"] },
    { label: "Appearance", ids: ["theme", "chat", "editor", "terminal"] },
    { label: "Projects", ids: ["projects"] },
    {
      label: "Providers",
      ids: [
        "muse",
        "providers",
        "codex",
        "mcp",
        "prompts",
        "skills",
        "subagents",
        "commandPalette",
      ],
    },
    { label: "System", ids: ["tooling", "lens", "developer", "changelog"] },
  ];
