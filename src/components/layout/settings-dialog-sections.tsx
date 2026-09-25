import { ProjectMemorySettingsSection } from "./ProjectMemoryControls";
import { CraneConnectorSettingsSection } from "@/components/layout/settings-dialog-crane-connector";
import { JiraConnectorSettingsSection } from "@/components/layout/settings-dialog-jira-connector";
import { MartinSyncSettingsSection } from "@/components/layout/settings-dialog-martin-sync";
import { TrackerTasksSettingsSection } from "@/components/layout/settings-dialog-tasks-section";
import { SettingsAuxiliaryInferenceSection } from "@/components/layout/settings-dialog-auxiliary-inference-section";
import { SettingsAutoRoutingSection } from "@/components/layout/settings-dialog-auto-routing-section";
import { type SectionId } from "@/components/layout/settings-dialog.schema";
import { sx } from "@/components/ads/utils/stylex";
import { settingsSectionsStyles as styles } from "./settings-dialog-sections.styles";
import { type RecentProjectState } from "@/store/project.utils";
import { ChangelogSection } from "./settings-dialog-changelog-section";
import { DeveloperSection } from "./settings-dialog-developer-section";
import { PresetsSection } from "./settings-dialog-presets-section";
import { MacrosSection } from "./settings-dialog-macros-section";
import { CodexSection } from "./settings-dialog-codex-section";
import { McpSection } from "./settings-dialog-mcp-section";
import { KickoffSection } from "./settings-dialog-kickoff-section";
import { ProvidersSection } from "./settings-dialog-providers-section";
import { ToolingSection } from "./settings-dialog-tooling-section";
import { ScriptsSection } from "./settings-dialog-scripts-section";
import { ThemeSection } from "./settings-sections/settings-dialog-theme-section";
import { GeneralSection } from "./settings-sections/settings-dialog-general-section";
import { CommandPaletteSection } from "./settings-sections/settings-dialog-command-palette-section";
import { ProjectsSection } from "./settings-sections/settings-dialog-projects-section";
import { TerminalSection } from "./settings-sections/settings-dialog-terminal-section";
import { ModelsSection } from "./settings-sections/settings-dialog-models-section";
import { ChatSection } from "./settings-sections/settings-dialog-chat-section";
import { SkillsSection } from "./settings-sections/settings-dialog-skills-section";
import { EditorSection } from "./settings-sections/settings-dialog-editor-section";
import { PromptsSection } from "./settings-sections/settings-dialog-prompts-section";
import { LensSection } from "./settings-sections/settings-dialog-lens-section";
import { SecretsSection } from "./settings-dialog-secrets";

export function SettingsDialogSectionContent(args: {
  sectionId: SectionId;
  currentProjectPath?: string | null;
  projects: RecentProjectState[];
  selectedProjectPath?: string | null;
  onNavigateSection?: (id: SectionId) => void;
}) {
  switch (args.sectionId) {
    case "general":
      return <GeneralSection />;
    case "projects":
      return (
        <ProjectsSection
          currentProjectPath={args.currentProjectPath}
          projects={args.projects}
          selectedProjectPath={args.selectedProjectPath}
          onNavigateSection={args.onNavigateSection}
        />
      );
    case "scripts":
      return (
        <ScriptsSection
          currentProjectPath={args.currentProjectPath}
          projects={args.projects}
          selectedProjectPath={args.selectedProjectPath}
        />
      );
    case "presets":
      return <PresetsSection />;
    case "macros":
      return <MacrosSection />;
    case "theme":
      return <ThemeSection />;
    case "terminal":
      return <TerminalSection />;
    case "chat":
      return <ChatSection />;
    case "tooling":
      return <ToolingSection />;
    case "skills":
      return <SkillsSection />;
    case "commandPalette":
      return <CommandPaletteSection />;
    case "editor":
      return <EditorSection />;
    case "providers":
      return <ProvidersSection />;
    case "models":
      return <ModelsSection />;
    case "codex":
      return <CodexSection />;
    case "mcp":
      return <McpSection />;
    case "integrations":
      return (
        <div className={sx(styles.spaceY8)}>
          <CraneConnectorSettingsSection />
          <JiraConnectorSettingsSection />
          <MartinSyncSettingsSection />
        </div>
      );
    case "tasks":
      return <TrackerTasksSettingsSection />;
    case "kickoff":
      return <KickoffSection />;
    case "auxiliaryInference":
      return <SettingsAuxiliaryInferenceSection />;
    case "autoRouting":
      return <SettingsAutoRoutingSection />;
    case "prompts":
      return <PromptsSection />;
    case "memory":
      return (
        <ProjectMemorySettingsSection
          projects={args.projects}
          initialProjectPath={
            args.selectedProjectPath ?? args.currentProjectPath
          }
        />
      );
    case "developer":
      return <DeveloperSection />;
    case "lens":
      return <LensSection />;
    case "secrets":
      return <SecretsSection />;
    case "changelog":
      return <ChangelogSection />;
    default:
      return null;
  }
}
