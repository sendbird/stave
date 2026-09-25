import { useCallback, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Badge, Input, toast } from "@/components/ui";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { settingsSectionsStyles as styles } from "../settings-dialog-sections.styles";
import {
  LensAgentPresentationMode,
  LensSessionScope,
} from "@/lib/lens/lens.types";
import { normalizeLensHostEntry } from "@/lib/lens/lens-security";
import { useAppStore } from "@/store/app.store";
import { LensCredentialsSettingsCard } from "../settings-dialog-lens-credentials";
import {
  ChoiceButtons,
  LabeledField,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "../settings-dialog.shared";
import { DraftTextarea } from "../settings-dialog.shared";

function parseLensHostList(value: string): string[] {
  const seen = new Set<string>();
  const hosts: string[] = [];

  for (const line of value.split("\n")) {
    const host = line.trim().toLowerCase();
    if (!host || seen.has(host)) {
      continue;
    }
    seen.add(host);
    hosts.push(host);
  }

  return hosts;
}

function formatLensHostList(hosts: readonly string[]): string {
  return hosts.join("\n");
}

export function LensSection() {
  const [
    heuristic,
    reactDebugSource,
    sessionScope,
    agentPresentationMode,
    developerModeCdp,
    visualCommentScreenshotsAsImageContext,
    cdpApprovedHosts,
    allowedHosts,
    blockedHosts,
    activeWorkspaceId,
    projectPath,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.lensSourceMappingHeuristic,
          state.settings.lensSourceMappingReactDebugSource,
          state.settings.lensSessionScope,
          state.settings.lensAgentPresentationMode,
          state.settings.lensDeveloperModeCdp,
          state.settings.lensVisualCommentScreenshotsAsImageContext,
          state.settings.lensCdpApprovedHosts,
          state.settings.lensAllowedHosts,
          state.settings.lensBlockedHosts,
          state.activeWorkspaceId,
          state.projectPath,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [clearingScope, setClearingScope] = useState<LensSessionScope | null>(
    null,
  );
  const [cdpHostDraft, setCdpHostDraft] = useState("");
  const allowedHostsText = useMemo(
    () => formatLensHostList(allowedHosts),
    [allowedHosts],
  );
  const blockedHostsText = useMemo(
    () => formatLensHostList(blockedHosts),
    [blockedHosts],
  );
  const clearLensSessionData = useCallback(
    async (scope: LensSessionScope) => {
      if (!activeWorkspaceId) {
        toast.error("Select a workspace before clearing Lens data.");
        return;
      }

      const clearSessionData = window.api?.lens?.clearSessionData;
      if (!clearSessionData) {
        toast.error("Lens session controls are unavailable.");
        return;
      }

      setClearingScope(scope);
      try {
        const result = await clearSessionData({
          workspaceId: activeWorkspaceId,
          sessionScope: scope,
          projectKey: projectPath,
        });
        if (!result.ok) {
          toast.error("Failed to clear Lens data", {
            description: result.message,
          });
          return;
        }
        toast.success(
          scope === "project"
            ? "Project Lens data cleared"
            : "Workspace Lens data cleared",
        );
      } catch (err) {
        toast.error("Failed to clear Lens data", {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setClearingScope(null);
      }
    },
    [activeWorkspaceId, projectPath],
  );
  const addCdpApprovedHost = useCallback(() => {
    const host = normalizeLensHostEntry(cdpHostDraft);
    if (!host) {
      toast.error("Enter a valid host or URL.");
      return;
    }

    const alreadyApproved = cdpApprovedHosts.some(
      (entry) => normalizeLensHostEntry(entry) === host,
    );
    if (alreadyApproved) {
      toast.message("Host is already approved", {
        description: host,
      });
      setCdpHostDraft("");
      return;
    }

    updateSettings({
      patch: {
        lensCdpApprovedHosts: [...cdpApprovedHosts, host],
      },
    });
    setCdpHostDraft("");
  }, [cdpApprovedHosts, cdpHostDraft, updateSettings]);

  return (
    <>
      <SectionStack>
        <SettingsCard
          title="Session & Sign-in"
          description="Control where Lens keeps website cookies and local browser storage. Saved account passwords are managed separately below."
        >
          <ChoiceButtons<LensSessionScope>
            value={sessionScope}
            columns={2}
            options={[
              {
                value: "project",
                label: "Project profile",
                description:
                  "Share Lens sign-in across workspaces for this project.",
              },
              {
                value: "workspace",
                label: "Workspace isolated",
                description:
                  "Keep Lens sign-in separate for the active workspace.",
              },
            ]}
            onChange={(value) =>
              updateSettings({ patch: { lensSessionScope: value } })
            }
          />
          <div className={sx(styles.clearButtonsGrid)}>
            <Button
              type="button"
              variant="soft"
              tone="danger"
              size="sm"
              disabled={
                !activeWorkspaceId || !projectPath || clearingScope !== null
              }
              onClick={() => {
                void clearLensSessionData("project");
              }}
              xstyle={styles.clearButton}
            >
              {clearingScope === "project" ? (
                <Loader2 className={sx(styles.spinIcon)} />
              ) : (
                <Trash2 className={sx(styles.iconSm)} />
              )}
              Clear project data
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!activeWorkspaceId || clearingScope !== null}
              onClick={() => {
                void clearLensSessionData("workspace");
              }}
              xstyle={styles.clearButton}
            >
              {clearingScope === "workspace" ? (
                <Loader2 className={sx(styles.spinIcon)} />
              ) : (
                <Trash2 className={sx(styles.iconSm)} />
              )}
              Clear workspace data
            </Button>
          </div>
        </SettingsCard>
        <SettingsCard
          title="Agent Activity"
          description="Choose how a hidden Lens session appears when an agent starts visual inspection or page interaction. Navigation, DOM reads, and diagnostics alone stay hidden."
        >
          <ChoiceButtons<LensAgentPresentationMode>
            value={agentPresentationMode}
            columns={3}
            options={[
              {
                value: "split-right",
                label: "Show beside task",
                description:
                  "Open Lens in a right split without taking focus from the task.",
              },
              {
                value: "background-tab",
                label: "Background tab",
                description:
                  "Add a Lens tab without changing the visible task surface.",
              },
              {
                value: "agent-decides",
                label: "Agent decides",
                description:
                  "Keep agent sessions hidden until the agent explicitly presents one.",
              },
            ]}
            onChange={(value) =>
              updateSettings({
                patch: { lensAgentPresentationMode: value },
              })
            }
          />
        </SettingsCard>
        <LensCredentialsSettingsCard />
        <SettingsCard
          title="Source Code Mapping"
          description="Choose which strategies the element picker uses to help AI locate source files."
        >
          <SwitchField
            title="Heuristic Search"
            description="AI uses class names, text content, and IDs to search for source files via grep. Recommended for most projects."
            checked={heuristic}
            onCheckedChange={(checked) =>
              updateSettings({
                patch: { lensSourceMappingHeuristic: checked },
              })
            }
          />
          <SwitchField
            title="React _debugSource"
            description="Extract exact file and line number from React fiber internals. Only works with dev builds that include @babel/plugin-transform-react-jsx-source (enabled by default in Vite React plugin, CRA, and Next.js dev)."
            checked={reactDebugSource}
            onCheckedChange={(checked) =>
              updateSettings({
                patch: { lensSourceMappingReactDebugSource: checked },
              })
            }
          />
        </SettingsCard>
        <SettingsCard
          title="Visual Comments"
          description="Control whether visual comment screenshots are used only as local UI context or also sent to the selected AI provider."
        >
          <SwitchField
            title="Send screenshots as AI image context"
            description="Off by default. When enabled, screenshots captured through visual comment are included with the next message so the AI can inspect the selected region."
            checked={visualCommentScreenshotsAsImageContext}
            onCheckedChange={(checked) =>
              updateSettings({
                patch: {
                  lensVisualCommentScreenshotsAsImageContext: checked,
                },
              })
            }
          />
        </SettingsCard>
        <SettingsCard
          title="Developer Mode"
          description="Control CDP-backed Lens actions such as screenshots, JavaScript evaluation, and agent page control. Approval prompts appear app-wide, even when the Lens panel is closed."
        >
          <SwitchField
            title="CDP Tools"
            description="Ask before the first CDP action for each host. Allow once is temporary; always allow saves the hostname below."
            checked={developerModeCdp}
            onCheckedChange={(checked) =>
              updateSettings({
                patch: { lensDeveloperModeCdp: checked },
              })
            }
          />
          <div className={sx(styles.spaceY2)}>
            <div className={sx(styles.cdpLabel)}>Approved CDP Hosts</div>
            <div className={sx(styles.cdpInputRow)}>
              <Input
                value={cdpHostDraft}
                placeholder="localhost or https://example.com"
                aria-label="CDP approved host"
                xstyle={styles.input8Mono}
                onChange={(event) => setCdpHostDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCdpApprovedHost();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                xstyle={styles.cdpAddButton}
                onClick={addCdpApprovedHost}
              >
                <Plus className={sx(styles.iconSm)} />
                Add host
              </Button>
            </div>
            <p className={sx(styles.cdpHelp)}>
              Enter a hostname or URL. Ports and paths are ignored, so{" "}
              <code>localhost</code> covers <code>localhost:3000</code>,{" "}
              <code>localhost:8899</code>, and other localhost ports.
            </p>
            {cdpApprovedHosts.length > 0 ? (
              <div className={sx(styles.cdpHostList)}>
                {cdpApprovedHosts.map((host) => (
                  <Badge
                    key={host}
                    variant="secondary"
                    className={sx(styles.cdpHostBadge)}
                  >
                    <span className={sx(styles.cdpHostText)}>{host}</span>
                    <Button
                      type="button"
                      size="xs"
                      iconOnly
                      variant="quiet"
                      aria-label={`Remove ${host}`}
                      onClick={() =>
                        updateSettings({
                          patch: {
                            lensCdpApprovedHosts: cdpApprovedHosts.filter(
                              (entry) => entry !== host,
                            ),
                          },
                        })
                      }
                    >
                      <Trash2 className={sx(styles.iconXs)} />
                    </Button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className={sx(styles.captionMuted)}>
                No hosts are pre-approved. The first CDP action will show an
                approval dialog.
              </p>
            )}
          </div>
        </SettingsCard>
        <SettingsCard
          title="Site Access"
          description="Restrict Lens navigation by hostname. Blocked hosts win over allowed hosts. Loopback targets are always allowed for navigation, but CDP actions still require approval above."
        >
          <LabeledField
            title="Allowed Hosts"
            description="One host per line. Leave empty to allow any host that is not blocked."
          >
            <DraftTextarea
              value={allowedHostsText}
              placeholder={"example.com\napp.example.com"}
              rows={4}
              onCommit={(value) =>
                updateSettings({
                  patch: { lensAllowedHosts: parseLensHostList(value) },
                })
              }
            />
          </LabeledField>
          <LabeledField
            title="Blocked Hosts"
            description="One host per line. These hosts are blocked even when they also match the allow list."
          >
            <DraftTextarea
              value={blockedHostsText}
              placeholder={"example.org\nstaging.example.com"}
              rows={4}
              onCommit={(value) =>
                updateSettings({
                  patch: { lensBlockedHosts: parseLensHostList(value) },
                })
              }
            />
          </LabeledField>
        </SettingsCard>
      </SectionStack>
    </>
  );
}
