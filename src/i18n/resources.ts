/**
 * Bundled locale catalogs.
 *
 * Every namespace ships for every locale so Stave works offline and the UI
 * never shows a raw key. `bun run check:i18n` fails when a namespace file is
 * added to `src/locales` without being registered here.
 */
import en_common from "@/locales/en/common.json";
import en_desktop from "@/locales/en/desktop.json";
import en_settings from "@/locales/en/settings.json";
import en_settingsProviders from "@/locales/en/settingsProviders.json";
import en_settingsConnections from "@/locales/en/settingsConnections.json";
import en_shell from "@/locales/en/shell.json";
import en_editor from "@/locales/en/editor.json";
import en_terminal from "@/locales/en/terminal.json";
import en_workspace from "@/locales/en/workspace.json";
import en_automation from "@/locales/en/automation.json";
import en_kickoff from "@/locales/en/kickoff.json";
import en_issues from "@/locales/en/issues.json";
import en_fleet from "@/locales/en/fleet.json";
import en_sourceControl from "@/locales/en/sourceControl.json";
import en_gitGraph from "@/locales/en/gitGraph.json";
import en_session from "@/locales/en/session.json";
import en_composer from "@/locales/en/composer.json";
import en_panes from "@/locales/en/panes.json";
import en_lens from "@/locales/en/lens.json";
import en_scripts from "@/locales/en/scripts.json";
import en_agents from "@/locales/en/agents.json";
import en_agentRuns from "@/locales/en/agentRuns.json";
import en_providers from "@/locales/en/providers.json";
import en_usage from "@/locales/en/usage.json";
import en_compare from "@/locales/en/compare.json";
import en_ui from "@/locales/en/ui.json";
import en_notifications from "@/locales/en/notifications.json";
import en_app from "@/locales/en/app.json";
import ko_common from "@/locales/ko/common.json";
import ko_desktop from "@/locales/ko/desktop.json";
import ko_settings from "@/locales/ko/settings.json";
import ko_settingsProviders from "@/locales/ko/settingsProviders.json";
import ko_settingsConnections from "@/locales/ko/settingsConnections.json";
import ko_shell from "@/locales/ko/shell.json";
import ko_editor from "@/locales/ko/editor.json";
import ko_terminal from "@/locales/ko/terminal.json";
import ko_workspace from "@/locales/ko/workspace.json";
import ko_automation from "@/locales/ko/automation.json";
import ko_kickoff from "@/locales/ko/kickoff.json";
import ko_issues from "@/locales/ko/issues.json";
import ko_fleet from "@/locales/ko/fleet.json";
import ko_sourceControl from "@/locales/ko/sourceControl.json";
import ko_gitGraph from "@/locales/ko/gitGraph.json";
import ko_session from "@/locales/ko/session.json";
import ko_composer from "@/locales/ko/composer.json";
import ko_panes from "@/locales/ko/panes.json";
import ko_lens from "@/locales/ko/lens.json";
import ko_scripts from "@/locales/ko/scripts.json";
import ko_agents from "@/locales/ko/agents.json";
import ko_agentRuns from "@/locales/ko/agentRuns.json";
import ko_providers from "@/locales/ko/providers.json";
import ko_usage from "@/locales/ko/usage.json";
import ko_compare from "@/locales/ko/compare.json";
import ko_ui from "@/locales/ko/ui.json";
import ko_notifications from "@/locales/ko/notifications.json";
import ko_app from "@/locales/ko/app.json";

export const I18N_NAMESPACES = [
  "common",
  "desktop",
  "settings",
  "settingsProviders",
  "settingsConnections",
  "shell",
  "editor",
  "terminal",
  "workspace",
  "automation",
  "kickoff",
  "issues",
  "fleet",
  "sourceControl",
  "gitGraph",
  "session",
  "composer",
  "panes",
  "lens",
  "scripts",
  "agents",
  "agentRuns",
  "providers",
  "usage",
  "compare",
  "ui",
  "notifications",
  "app",
] as const;

export type I18nNamespace = (typeof I18N_NAMESPACES)[number];

/** English is the source catalog and defines the typed key set. */
export const sourceResources = {
  common: en_common,
  desktop: en_desktop,
  settings: en_settings,
  settingsProviders: en_settingsProviders,
  settingsConnections: en_settingsConnections,
  shell: en_shell,
  editor: en_editor,
  terminal: en_terminal,
  workspace: en_workspace,
  automation: en_automation,
  kickoff: en_kickoff,
  issues: en_issues,
  fleet: en_fleet,
  sourceControl: en_sourceControl,
  gitGraph: en_gitGraph,
  session: en_session,
  composer: en_composer,
  panes: en_panes,
  lens: en_lens,
  scripts: en_scripts,
  agents: en_agents,
  agentRuns: en_agentRuns,
  providers: en_providers,
  usage: en_usage,
  compare: en_compare,
  ui: en_ui,
  notifications: en_notifications,
  app: en_app,
} as const;

export const resources = {
  en: sourceResources,
  ko: {
    common: ko_common,
    desktop: ko_desktop,
    settings: ko_settings,
    settingsProviders: ko_settingsProviders,
    settingsConnections: ko_settingsConnections,
    shell: ko_shell,
    editor: ko_editor,
    terminal: ko_terminal,
    workspace: ko_workspace,
    automation: ko_automation,
    kickoff: ko_kickoff,
    issues: ko_issues,
    fleet: ko_fleet,
    sourceControl: ko_sourceControl,
    gitGraph: ko_gitGraph,
    session: ko_session,
    composer: ko_composer,
    panes: ko_panes,
    lens: ko_lens,
    scripts: ko_scripts,
    agents: ko_agents,
    agentRuns: ko_agentRuns,
    providers: ko_providers,
    usage: ko_usage,
    compare: ko_compare,
    ui: ko_ui,
    notifications: ko_notifications,
    app: ko_app,
  },
} as const;
