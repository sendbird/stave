import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  ExternalAnchor,
  Loader,
} from "@/components/ui";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import {
  AppWindow,
  Bot,
  ExternalLink,
  Package2,
  Plug2,
  Sparkles,
  Webhook,
} from "lucide-react";
import type {
  CodexAppServerSnapshot,
  CodexPluginDetailSnapshot,
  CodexPluginSummarySnapshot,
} from "@/lib/providers/provider.types";
import { codexStyles } from "../settings-dialog-codex-section.styles";
import {
  DenseSection,
  ReadOnlyCodeBlock,
  StatusPill,
  type DetailState,
} from "./shared";

type ResourcePreviewState = {
  status: "idle" | "loading" | "ready" | "error";
  title: string;
  detail: string;
  body: string;
};
type ExtensionsTabProps = {
  snapshot: CodexAppServerSnapshot | null;
  selectedPluginId: string | null;
  onSelectPlugin: (id: string | null) => void;
  selectedPluginSummary: CodexPluginSummarySnapshot | null;
  pluginDetailState: DetailState<CodexPluginDetailSnapshot>;
  resourcePreview: ResourcePreviewState;
  busyKey: string | null;
  onOauthLogin: (serverName: string) => void;
  onReadResource: (args: { server: string; uri: string }) => void;
  onFeatureToggle: (name: string, enabled: boolean) => void;
  onPluginInstall: () => void;
  onPluginUninstall: () => void;
};

export function ExtensionsTab({
  snapshot,
  selectedPluginId,
  onSelectPlugin,
  selectedPluginSummary,
  pluginDetailState,
  resourcePreview,
  busyKey,
  onOauthLogin,
  onReadResource,
  onFeatureToggle,
  onPluginInstall,
  onPluginUninstall,
}: ExtensionsTabProps) {
  return (
    <>
      {!snapshot ? null : (
        <div className={sx(codexStyles.twoColGrid1b)}>
          <div className={sx(codexStyles.stack4)}>
            <DenseSection
              title="Plugins and apps"
              description="Installed, discoverable, and currently accessible extension surfaces."
            >
              <Accordion multiple className={sx(codexStyles.wFullSpace3)}>
                <AccordionItem
                  value="plugins"
                  className={sx(codexStyles.accordionItem)}
                >
                  <AccordionTrigger className={sx(codexStyles.py3)}>
                    <div className={sx(codexStyles.rowCenterGap2)}>
                      <Package2 className={sx(codexStyles.icon4)} />
                      <span>Plugins</span>
                      <StatusPill label={`${snapshot.plugins.length}`} />
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className={sx(codexStyles.space2Pb3)}>
                    {snapshot.plugins.length === 0 ? (
                      <p className={sx(codexStyles.textSmMuted)}>
                        No plugins returned by the current App Server runtime.
                      </p>
                    ) : (
                      snapshot.plugins.map((plugin) => (
                        <AdsButton
                          key={plugin.id}
                          type="button"
                          layout="host"
                          press="none"
                          onClick={() => onSelectPlugin(plugin.id)}
                          xstyle={[
                            codexStyles.rowButton,
                            selectedPluginId === plugin.id
                              ? codexStyles.rowButtonSelected
                              : codexStyles.rowButtonResting,
                          ]}
                        >
                          <div className={sx(codexStyles.minW0Grow1Space1)}>
                            <div className={sx(codexStyles.rowWrapCenterGap2)}>
                              <p className={sx(codexStyles.textSmMedium)}>
                                {plugin.name}
                              </p>
                              <StatusPill
                                label={
                                  plugin.installed
                                    ? "installed"
                                    : "discoverable"
                                }
                                tone={plugin.installed ? "success" : "warning"}
                              />
                              {plugin.enabled ? (
                                <StatusPill label="enabled" tone="success" />
                              ) : null}
                            </div>
                            <p className={sx(codexStyles.breakWordsXsMuted)}>
                              {plugin.marketplaceDisplayName ??
                                plugin.marketplaceName}
                            </p>
                          </div>
                          <div
                            className={sx(codexStyles.rowSource)}
                            title={plugin.source}
                          >
                            {plugin.source}
                          </div>
                        </AdsButton>
                      ))
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="apps"
                  className={sx(codexStyles.accordionItem)}
                >
                  <AccordionTrigger className={sx(codexStyles.py3)}>
                    <div className={sx(codexStyles.rowCenterGap2)}>
                      <AppWindow className={sx(codexStyles.icon4)} />
                      <span>Apps</span>
                      <StatusPill label={`${snapshot.apps.length}`} />
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className={sx(codexStyles.space2Pb3)}>
                    {snapshot.apps.length === 0 ? (
                      <p className={sx(codexStyles.textSmMuted)}>
                        No apps returned by the current App Server runtime.
                      </p>
                    ) : (
                      snapshot.apps.map((app) => (
                        <div key={app.id} className={sx(codexStyles.bgTile40)}>
                          <div className={sx(codexStyles.rowColSmRow)}>
                            <div className={sx(codexStyles.minW0Grow1)}>
                              <p className={sx(codexStyles.breakWordsSmMedium)}>
                                {app.name}
                              </p>
                              <p className={sx(codexStyles.breakWordsXsMuted)}>
                                {app.description ?? "No description"}
                              </p>
                            </div>
                            <div className={sx(codexStyles.shrink0WrapRow)}>
                              <StatusPill
                                label={
                                  app.isAccessible
                                    ? "accessible"
                                    : "not accessible"
                                }
                                tone={app.isAccessible ? "success" : "warning"}
                              />
                              {app.isEnabled ? (
                                <StatusPill label="enabled" tone="success" />
                              ) : null}
                              {app.installUrl ? (
                                <ExternalAnchor
                                  href={app.installUrl}
                                  className={sx(codexStyles.inlineAnchorXs)}
                                >
                                  Open
                                  <ExternalLink
                                    className={sx(codexStyles.size3Icon)}
                                  />
                                </ExternalAnchor>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="skills"
                  className={sx(codexStyles.accordionItem)}
                >
                  <AccordionTrigger className={sx(codexStyles.py3)}>
                    <div className={sx(codexStyles.rowCenterGap2)}>
                      <Bot className={sx(codexStyles.icon4)} />
                      <span>Skills</span>
                      <StatusPill
                        label={String(
                          snapshot.skills.reduce(
                            (total, group) => total + group.skills.length,
                            0,
                          ),
                        )}
                      />
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className={sx(codexStyles.space3Pb3)}>
                    {snapshot.skills.length === 0 ? (
                      <p className={sx(codexStyles.textSmMuted)}>
                        No skill groups returned by the current workspace.
                      </p>
                    ) : (
                      snapshot.skills.map((group) => (
                        <div
                          key={group.cwd}
                          className={sx(codexStyles.bgTile40)}
                        >
                          <p className={sx(codexStyles.breakAllXsMuted)}>
                            {group.cwd}
                          </p>
                          <div className={sx(codexStyles.mt2Chips)}>
                            {group.skills.map((skill) => (
                              <StatusPill
                                key={`${group.cwd}:${skill.path}`}
                                label={skill.name}
                                tone={skill.enabled ? "success" : "default"}
                              />
                            ))}
                          </div>
                          {group.errors.length > 0 ? (
                            <div
                              className={sx(codexStyles.mt3Space1XsDangerErr)}
                            >
                              {group.errors.map((error, index) => (
                                <p key={`${group.cwd}:error:${index}`}>
                                  {error}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="mcp"
                  className={sx(codexStyles.accordionItem)}
                >
                  <AccordionTrigger className={sx(codexStyles.py3)}>
                    <div className={sx(codexStyles.rowCenterGap2)}>
                      <Plug2 className={sx(codexStyles.icon4)} />
                      <span>MCP servers</span>
                      <StatusPill label={`${snapshot.mcpServers.length}`} />
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className={sx(codexStyles.space2Pb3)}>
                    {snapshot.mcpServers.length === 0 ? (
                      <p className={sx(codexStyles.textSmMuted)}>
                        No MCP servers returned by the current App Server
                        runtime.
                      </p>
                    ) : (
                      snapshot.mcpServers.map((server) => (
                        <div
                          key={server.name}
                          className={sx(codexStyles.bgTile40)}
                        >
                          <div className={sx(codexStyles.rowColSmRow)}>
                            <div className={sx(codexStyles.minW0Grow1)}>
                              <p className={sx(codexStyles.breakWordsSmMedium)}>
                                {server.name}
                              </p>
                              <p className={sx(codexStyles.breakAllXsMuted)}>
                                {server.transportType}
                                {server.url ? ` · ${server.url}` : ""}
                              </p>
                            </div>
                            <div className={sx(codexStyles.shrink0WrapRow)}>
                              <StatusPill
                                label={server.authStatus ?? "unknown auth"}
                                tone={
                                  server.authStatus
                                    ?.toLowerCase()
                                    .includes("ok") ||
                                  server.authStatus
                                    ?.toLowerCase()
                                    .includes("connected")
                                    ? "success"
                                    : server.authStatus
                                          ?.toLowerCase()
                                          .includes("auth")
                                      ? "warning"
                                      : "default"
                                }
                              />
                              {server.authStatus
                                ?.toLowerCase()
                                .includes("auth") ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  xstyle={codexStyles.h7Only}
                                  onClick={() => {
                                    void onOauthLogin(server.name);
                                  }}
                                  disabled={busyKey === `oauth:${server.name}`}
                                >
                                  {busyKey === `oauth:${server.name}` ? (
                                    <Loader
                                      aria-hidden
                                      className={sx(codexStyles.mr1)}
                                      size="xs"
                                      variant="spinner"
                                    />
                                  ) : null}
                                  Login
                                </Button>
                              ) : null}
                            </div>
                          </div>

                          {(server.resources?.length ?? 0) > 0 ? (
                            <div className={sx(codexStyles.mt3Space2)}>
                              {server.resources?.slice(0, 5).map((resource) => (
                                <div
                                  key={`${server.name}:${resource.uri}`}
                                  className={sx(codexStyles.resourceRow)}
                                >
                                  <div className={sx(codexStyles.minW0Grow1)}>
                                    <p
                                      className={sx(
                                        codexStyles.breakWordsXsFontMedium,
                                      )}
                                    >
                                      {resource.title ?? resource.name}
                                    </p>
                                    <p
                                      className={sx(
                                        codexStyles.breakAllXsMuted,
                                      )}
                                    >
                                      {resource.uri}
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    xstyle={codexStyles.h7Xs}
                                    onClick={() => {
                                      void onReadResource({
                                        server: server.name,
                                        uri: resource.uri,
                                      });
                                    }}
                                    disabled={
                                      busyKey ===
                                      `resource:${server.name}:${resource.uri}`
                                    }
                                  >
                                    Preview
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="hooks"
                  className={sx(codexStyles.accordionItem)}
                >
                  <AccordionTrigger className={sx(codexStyles.py3)}>
                    <div className={sx(codexStyles.rowCenterGap2)}>
                      <Webhook className={sx(codexStyles.icon4)} />
                      <span>Provider hooks</span>
                      <StatusPill
                        label={`${snapshot.hooks.reduce(
                          (count, group) => count + group.hooks.length,
                          0,
                        )}`}
                      />
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className={sx(codexStyles.space3Pb3)}>
                    {snapshot.hooks.length === 0 ? (
                      <p className={sx(codexStyles.textSmMuted)}>
                        No hook inventory was returned by the selected Codex
                        runtime.
                      </p>
                    ) : (
                      snapshot.hooks.map((group) => (
                        <div key={group.cwd} className={sx(codexStyles.stack2)}>
                          <p className={sx(codexStyles.breakAllXsMuted)}>
                            {group.cwd}
                          </p>
                          {group.hooks.map((hook) => (
                            <div
                              key={`${group.cwd}:${hook.key}`}
                              className={sx(codexStyles.bgTile40)}
                            >
                              <div className={sx(codexStyles.rowColSmRow)}>
                                <div className={sx(codexStyles.minW0Space1)}>
                                  <p
                                    className={sx(
                                      codexStyles.breakWordsSmMedium,
                                    )}
                                  >
                                    {hook.key || hook.handlerType}
                                  </p>
                                  <p
                                    className={sx(codexStyles.breakAllXsMuted)}
                                  >
                                    {hook.sourcePath}
                                  </p>
                                  {hook.statusMessage ? (
                                    <p className={sx(codexStyles.textXsMuted)}>
                                      {hook.statusMessage}
                                    </p>
                                  ) : null}
                                </div>
                                <div className={sx(codexStyles.shrink0WrapRow)}>
                                  <StatusPill
                                    label={hook.eventName}
                                    tone={hook.enabled ? "success" : "default"}
                                  />
                                  <StatusPill label={hook.handlerType} />
                                  <StatusPill
                                    label={hook.trustStatus}
                                    tone={
                                      hook.trustStatus === "trusted" ||
                                      hook.trustStatus === "managed"
                                        ? "success"
                                        : hook.trustStatus === "modified"
                                          ? "warning"
                                          : "danger"
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                          {group.warnings.map((warning, index) => (
                            <p
                              key={`${group.cwd}:warning:${index}`}
                              className={sx(codexStyles.textXsMuted)}
                            >
                              {warning}
                            </p>
                          ))}
                          {group.errors.map((error, index) => (
                            <p
                              key={`${group.cwd}:error:${index}`}
                              className={sx(codexStyles.textXsDangerOnly)}
                            >
                              {error}
                            </p>
                          ))}
                        </div>
                      ))
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem
                  value="experimental"
                  className={sx(codexStyles.accordionItem)}
                >
                  <AccordionTrigger className={sx(codexStyles.py3)}>
                    <div className={sx(codexStyles.rowCenterGap2)}>
                      <Sparkles className={sx(codexStyles.icon4)} />
                      <span>Experimental features</span>
                      <StatusPill
                        label={`${snapshot.experimentalFeatures.length}`}
                      />
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className={sx(codexStyles.space2Pb3)}>
                    {snapshot.experimentalFeatures.length === 0 ? (
                      <p className={sx(codexStyles.textSmMuted)}>
                        No experimental features are currently reported.
                      </p>
                    ) : (
                      snapshot.experimentalFeatures.map((feature) => (
                        <div
                          key={feature.name}
                          className={sx(codexStyles.featureRow)}
                        >
                          <div className={sx(codexStyles.stack1)}>
                            <div className={sx(codexStyles.rowWrapCenterGap2)}>
                              <p className={sx(codexStyles.textSmMedium)}>
                                {feature.displayName ?? feature.name}
                              </p>
                              <StatusPill label={feature.stage} />
                              {feature.defaultEnabled ? (
                                <StatusPill label="default on" />
                              ) : null}
                            </div>
                            <p className={sx(codexStyles.textXsMuted)}>
                              {feature.description ?? "No description"}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant={feature.enabled ? "default" : "outline"}
                            xstyle={codexStyles.h8Only}
                            onClick={() => {
                              void onFeatureToggle(
                                feature.name,
                                !feature.enabled,
                              );
                            }}
                            disabled={busyKey === `feature:${feature.name}`}
                          >
                            {busyKey === `feature:${feature.name}` ? (
                              <Loader
                                aria-hidden
                                className={sx(codexStyles.mr1)}
                                size="xs"
                                variant="spinner"
                              />
                            ) : null}
                            {feature.enabled ? "Disable" : "Enable"}
                          </Button>
                        </div>
                      ))
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </DenseSection>
          </div>

          <div className={sx(codexStyles.stack4)}>
            <DenseSection
              title="Inspector"
              description="Selected plugin detail or the latest MCP resource preview."
            >
              {pluginDetailState.status === "ready" &&
              pluginDetailState.value ? (
                <div className={sx(codexStyles.stack4)}>
                  <div className={sx(codexStyles.stack1)}>
                    <div className={sx(codexStyles.rowWrapCenterGap2)}>
                      <p className={sx(codexStyles.inspectorTitle)}>
                        {pluginDetailState.value.name}
                      </p>
                      <StatusPill
                        label={
                          pluginDetailState.value.installed
                            ? "installed"
                            : "discoverable"
                        }
                        tone={
                          pluginDetailState.value.installed
                            ? "success"
                            : "warning"
                        }
                      />
                    </div>
                    <p className={sx(codexStyles.textSmMuted)}>
                      {pluginDetailState.value.description ??
                        "No plugin description."}
                    </p>
                  </div>

                  <div className={sx(codexStyles.rowWrapCenterGap2)}>
                    {selectedPluginSummary?.installed ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void onPluginUninstall();
                        }}
                        disabled={
                          busyKey ===
                          `plugin-uninstall:${selectedPluginSummary.id}`
                        }
                      >
                        {busyKey ===
                        `plugin-uninstall:${selectedPluginSummary.id}` ? (
                          <Loader
                            aria-hidden
                            className={sx(codexStyles.mr1)}
                            size="xs"
                            variant="spinner"
                          />
                        ) : null}
                        Uninstall
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          void onPluginInstall();
                        }}
                        disabled={
                          busyKey ===
                          `plugin-install:${selectedPluginSummary?.id ?? ""}`
                        }
                      >
                        {busyKey ===
                        `plugin-install:${selectedPluginSummary?.id ?? ""}` ? (
                          <Loader
                            aria-hidden
                            className={sx(codexStyles.mr1)}
                            size="xs"
                            variant="compile"
                          />
                        ) : null}
                        Install
                      </Button>
                    )}
                  </div>

                  <div className={sx(codexStyles.stack3)}>
                    <div>
                      <p className={sx(codexStyles.eyebrow)}>Skills</p>
                      <div className={sx(codexStyles.mt2Chips)}>
                        {pluginDetailState.value.skills.length > 0 ? (
                          pluginDetailState.value.skills.map((skill) => (
                            <StatusPill
                              key={skill.path}
                              label={skill.name}
                              tone={skill.enabled ? "success" : "default"}
                            />
                          ))
                        ) : (
                          <p className={sx(codexStyles.textSmMuted)}>
                            No plugin skills.
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className={sx(codexStyles.eyebrow)}>
                        Apps needing auth
                      </p>
                      <div className={sx(codexStyles.mt2Space2)}>
                        {pluginDetailState.value.apps.length > 0 ? (
                          pluginDetailState.value.apps.map((app) => (
                            <div
                              key={app.id}
                              className={sx(codexStyles.smallTile)}
                            >
                              <div className={sx(codexStyles.rowColSmRow)}>
                                <p
                                  className={sx(codexStyles.minW0BreakSmMedium)}
                                >
                                  {app.name}
                                </p>
                                {app.installUrl ? (
                                  <ExternalAnchor
                                    href={app.installUrl}
                                    className={sx(codexStyles.inlineAnchorXs)}
                                  >
                                    Open
                                    <ExternalLink
                                      className={sx(codexStyles.size3Icon)}
                                    />
                                  </ExternalAnchor>
                                ) : null}
                              </div>
                              <p className={sx(codexStyles.mt1BreakXsMuted)}>
                                {app.description ?? "No description"}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className={sx(codexStyles.textSmMuted)}>
                            No app-level auth requirements.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : resourcePreview.status !== "idle" ? (
                <div className={sx(codexStyles.stack3)}>
                  <div>
                    <p className={sx(codexStyles.inspectorTitle)}>
                      {resourcePreview.title}
                    </p>
                    <p className={sx(codexStyles.textSmMutedMt1)}>
                      {resourcePreview.detail}
                    </p>
                  </div>
                  {resourcePreview.body.startsWith("http") ? (
                    <ExternalAnchor href={resourcePreview.body}>
                      Open authorization URL
                    </ExternalAnchor>
                  ) : (
                    <ReadOnlyCodeBlock
                      value={resourcePreview.body || "(empty)"}
                    />
                  )}
                </div>
              ) : (
                <div className={sx(codexStyles.tileDashedCentered)}>
                  Select a plugin or preview an MCP resource to inspect it here.
                </div>
              )}

              {pluginDetailState.status === "error" ? (
                <p className={sx(codexStyles.mt3TextSmDanger)}>
                  {pluginDetailState.detail}
                </p>
              ) : null}
            </DenseSection>
          </div>
        </div>
      )}
    </>
  );
}
