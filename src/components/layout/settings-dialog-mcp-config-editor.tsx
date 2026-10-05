import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
import { useEffect, useId, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@/components/ui";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import { sx } from "@/components/ads/utils/stylex";
import type {
  McpConfigProvider,
  McpConfigScope,
  McpConfigTransport,
  McpServerConfigMutationPreview,
  McpServerConfigMutationRequest,
  McpServerConfigSnapshot,
} from "@/lib/providers/mcp-config.types";
import {
  buildMcpConfigDraft,
  createInitialMcpConfigForm,
  formNeedsKiroSlackOAuthClientId,
  formShowsKiroOAuthClientIdField,
  formUsesCursorOfficialSlackClient,
  resolveMcpInstallProviders,
  validateMcpConfigForm,
} from "@/lib/providers/mcp-config-form";
import { resolveMcpShareDestinationScope } from "@/lib/providers/mcp-config-share";
import type { ProviderRuntimeOptions } from "@/lib/providers/provider.types";
import { mcpConfigEditorStyles as styles } from "./settings-dialog-mcp-config-editor.styles";

type McpEditorRuntimeOptions = {
  claude: ProviderRuntimeOptions;
  codex: ProviderRuntimeOptions;
  cursor: ProviderRuntimeOptions;
  kiro: ProviderRuntimeOptions;
};

function getRuntimeOptions(
  providers: readonly McpConfigProvider[],
  options: McpEditorRuntimeOptions,
) {
  return {
    ...(providers.includes("claude-code")
      ? { claudeBinaryPath: options.claude.claudeBinaryPath, claudeAccountProfileId: options.claude.claudeAccountProfileId }
      : {}),
    ...(providers.includes("codex")
      ? { codexBinaryPath: options.codex.codexBinaryPath, codexAccountProfileId: options.codex.codexAccountProfileId }
      : {}),
    ...(providers.includes("cursor")
      ? { cursorBinaryPath: options.cursor.cursorBinaryPath }
      : {}),
    ...(providers.includes("kiro")
      ? { kiroBinaryPath: options.kiro.kiroBinaryPath }
      : {}),
  };
}

function FormField(props: {
  label: string;
  htmlFor: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={sx(styles.fieldStack)}>
      <label htmlFor={props.htmlFor} className={sx(styles.fieldLabel)}>
        {props.label}
      </label>
      {props.children}
      {props.description ? (
        <p className={sx(styles.fieldDescription)}>{props.description}</p>
      ) : null}
    </div>
  );
}

function ReviewPanel(props: { preview: McpServerConfigMutationPreview }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  return (
    <div className={sx(styles.reviewStack)}>
      <div className={sx(styles.reviewCard)}>
        <p className={sx(styles.reviewTitle)}>{props.preview.title}</p>
        <ul className={sx(styles.reviewList)}>
          {props.preview.changes.map((change) => (
            <li key={change}>• {change}</li>
          ))}
        </ul>
      </div>
      {props.preview.warnings.length ? (
        <div className={sx(styles.warningCard)}>
          <p className={sx(styles.warningTitle)}>{t("settingsProviders:mcpConfigEditor.review.beforeApply")}</p>
          <ul className={sx(styles.warningList)}>
            {props.preview.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className={sx(styles.reviewNote)}>
        {t("settingsProviders:mcpConfigEditor.review.verifyNote")}</p>
    </div>
  );
}

export function McpServerConfigEditorDialog(props: {
  open: boolean;
  snapshot?: McpServerConfigSnapshot;
  workspaceCwd?: string;
  runtimeOptions: McpEditorRuntimeOptions;
  onOpenChange: (open: boolean) => void;
  onApplied: (detail: string, outcome?: "success" | "partial") => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const editing = Boolean(props.snapshot);
  const baseId = useId();
  const [form, setForm] = useState(() =>
    createInitialMcpConfigForm(props.snapshot),
  );
  const [preview, setPreview] = useState<McpServerConfigMutationPreview | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setForm(createInitialMcpConfigForm(props.snapshot));
    setPreview(null);
    setBusy(false);
    setError("");
  }, [props.open, props.snapshot]);

  const mutationRequest = useMemo(() => {
    try {
      validateMcpConfigForm({
        form,
        editing,
        workspaceCwd: props.workspaceCwd,
      });
      const draft = buildMcpConfigDraft({ form, editing });
      const installProviders = resolveMcpInstallProviders(form);
      const common = {
        cwd: props.workspaceCwd,
        runtimeOptions: getRuntimeOptions(
          editing ? [form.provider] : installProviders,
          props.runtimeOptions,
        ),
      };
      return editing && props.snapshot
        ? ({
            ...common,
            operation: "update",
            target: {
              provider: props.snapshot.provider,
              scope: props.snapshot.scope,
              name: props.snapshot.name,
            },
            draft,
          } satisfies McpServerConfigMutationRequest)
        : ({
            ...common,
            operation: "create",
            draft,
            installProviders,
          } satisfies McpServerConfigMutationRequest);
    } catch {
      return null;
    }
  }, [editing, form, props.runtimeOptions, props.snapshot, props.workspaceCwd]);

  async function previewChange() {
    setError("");
    try {
      validateMcpConfigForm({
        form,
        editing,
        workspaceCwd: props.workspaceCwd,
      });
      const request = mutationRequest;
      if (!request) throw new Error(i18n.t("settingsProviders:mcpConfigEditor.errors.formIncomplete"));
      const api = window.api?.provider?.previewMcpServerConfigMutation;
      if (!api)
        throw new Error(i18n.t("settingsProviders:mcpConfigEditor.errors.previewUnavailable"));
      setBusy(true);
      const result = await api(request);
      if (!result.ok || !result.preview) {
        throw new Error(result.detail);
      }
      setPreview(result.preview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function applyChange() {
    if (!preview || !mutationRequest) return;
    const api = window.api?.provider?.applyMcpServerConfigMutation;
    if (!api) {
      setError(i18n.t("settingsProviders:messages.mcpApplyUnavailable"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api({
        ...mutationRequest,
        expectedRevision: preview.revision,
      });
      if (!result.ok && result.results?.some((entry) => entry.ok)) {
        props.onApplied(result.detail, "partial");
        props.onOpenChange(false);
        return;
      }
      if (!result.ok) throw new Error(result.detail);
      props.onApplied(result.detail);
      props.onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  const setInstallProvider = (
    provider: McpConfigProvider,
    enabled: boolean,
  ) => {
    setForm((current) => {
      const nextProviders = enabled
        ? current.installProviders.includes(provider)
          ? current.installProviders
          : [...current.installProviders, provider]
        : current.installProviders.filter((entry) => entry !== provider);
      const primary = nextProviders.includes("claude-code")
        ? "claude-code"
        : (nextProviders[0] ?? current.provider);
      return {
        ...current,
        installProviders: nextProviders,
        provider: primary,
        scope:
          !nextProviders.includes("claude-code") && current.scope === "local"
            ? nextProviders.some(
                (entry) => entry === "cursor" || entry === "kiro",
              )
              ? "project"
              : "user"
            : nextProviders.length === 1 && nextProviders[0] === "codex"
              ? "user"
              : current.scope,
        transport:
          nextProviders.includes("codex") && current.transport === "sse"
            ? "http"
            : current.transport,
      };
    });
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!busy) props.onOpenChange(open);
      }}
    >
      <DialogContent xstyle={styles.dialogSurface}>
        <DialogHeader className={sx(styles.headerBlock)}>
          <DialogTitle className={sx(styles.headerTitle)}>
            {editing ? t("settingsProviders:mcpConfigEditor.editor.titleEdit") : t("settingsProviders:mcpConfigEditor.editor.titleAdd")}
          </DialogTitle>
          <DialogDescription className={sx(styles.headerDescription)}>
            {t("settingsProviders:mcpConfigEditor.editor.description")}</DialogDescription>
        </DialogHeader>

        <div className={sx(styles.scrollArea)}>
          {preview ? (
            <ReviewPanel preview={preview} />
          ) : (
            <form
              id={`${baseId}-form`}
              className={sx(styles.form)}
              onSubmit={(event) => {
                event.preventDefault();
                void previewChange();
              }}
            >
              <div className={sx(styles.columns)}>
                <FormField
                  label={editing ? t("settingsProviders:mcpConfigEditor.editor.provider") : t("settingsProviders:mcpConfigEditor.editor.installTo")}
                  htmlFor={`${baseId}-provider`}
                  description={
                    editing
                      ? undefined
                      : form.installProviders.length > 1
                        ? t("settingsProviders:mcpConfigEditor.editor.installToMany")
                        : t("settingsProviders:mcpConfigEditor.editor.installToOne")
                  }
                >
                  {editing ? (
                    <Select value={form.provider} disabled>
                      <SelectTrigger
                        id={`${baseId}-provider`}
                        className={sx(styles.fullWidth)}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="claude-code">Claude</SelectItem>
                        <SelectItem value="codex">Codex</SelectItem>
                        <SelectItem value="cursor">Cursor</SelectItem>
                        <SelectItem value="kiro">Kiro</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div
                      id={`${baseId}-provider`}
                      className={sx(styles.providerToggles)}
                    >
                      {(
                        [
                          ["claude-code", "Claude"],
                          ["codex", "Codex"],
                          ["cursor", "Cursor"],
                          ["kiro", "Kiro"],
                        ] as const
                      ).map(([provider, label]) => (
                        <div key={provider} className={sx(styles.providerRow)}>
                          <span className={sx(styles.providerLabel)}>
                            {label}
                          </span>
                          <Switch
                            checked={form.installProviders.includes(provider)}
                            onCheckedChange={(checked) =>
                              setInstallProvider(provider, checked)
                            }
                            aria-label={i18n.t("settingsProviders:settingsDialogMcpConfigEditor.installTo", { value1: label })}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </FormField>
                <FormField
                  label={t("settingsProviders:mcpConfigEditor.editor.scope")}
                  htmlFor={`${baseId}-scope`}
                  description={
                    form.installProviders.includes("codex") &&
                    form.installProviders.length === 1
                      ? t("settingsProviders:mcpConfigEditor.editor.scopeCodexOnly")
                      : form.installProviders.includes("codex") &&
                          form.scope !== "user"
                        ? t("settingsProviders:mcpConfigEditor.editor.scopeCodexMixed")
                        : t("settingsProviders:mcpConfigEditor.editor.scopeDefault")
                  }
                >
                  <Select
                    value={form.scope}
                    disabled={
                      editing ||
                      (form.installProviders.includes("codex") &&
                        form.installProviders.length === 1)
                    }
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        scope: value as McpConfigScope,
                      }))
                    }
                  >
                    <SelectTrigger
                      id={`${baseId}-scope`}
                      className={sx(styles.fullWidth)}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">{t("settingsProviders:mcpConfigEditor.editor.scopes.user")}</SelectItem>
                      {form.installProviders.includes("claude-code") ||
                      form.installProviders.includes("cursor") ||
                      form.installProviders.includes("kiro") ? (
                        <SelectItem
                          value="project"
                          disabled={!props.workspaceCwd}
                        >
                          {t("settingsProviders:mcpConfigEditor.editor.scopes.project")}</SelectItem>
                      ) : null}
                      {form.installProviders.includes("claude-code") ? (
                        <SelectItem
                          value="local"
                          disabled={!props.workspaceCwd}
                        >
                          {t("settingsProviders:mcpConfigEditor.editor.scopes.local")}</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              <div className={sx(styles.columns)}>
                <FormField label={t("settingsProviders:mcpConfigEditor.editor.serverName")} htmlFor={`${baseId}-name`}>
                  <Input
                    id={`${baseId}-name`}
                    autoFocus
                    value={form.name}
                    // i18n-ignore: example MCP server identifier
                    placeholder="github"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField label={t("settingsProviders:mcpConfigEditor.editor.transport")} htmlFor={`${baseId}-transport`}>
                  <Select
                    value={form.transport}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        transport: value as McpConfigTransport,
                      }))
                    }
                  >
                    <SelectTrigger
                      id={`${baseId}-transport`}
                      className={sx(styles.fullWidth)}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stdio">{/* i18n-ignore: MCP transport identifier */}stdio</SelectItem>
                      <SelectItem value="http">{/* i18n-ignore: MCP transport identifier */}HTTP</SelectItem>
                      {!form.installProviders.includes("codex") ? (
                        <SelectItem value="sse">{t("settingsProviders:mcpConfigEditor.editor.sseLegacy")}</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              {form.transport === "stdio" ? (
                <>
                  <FormField label={t("settingsProviders:mcpConfigEditor.editor.command")} htmlFor={`${baseId}-command`}>
                    <Input
                      id={`${baseId}-command`}
                      value={form.command}
                      // i18n-ignore: example command executable
                      placeholder="npx"
                      spellCheck={false}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          command: event.target.value,
                        }))
                      }
                    />
                  </FormField>
                  {editing && props.snapshot?.argumentCount ? (
                    <div className={sx(styles.toggleRow)}>
                      <div>
                        <p className={sx(styles.toggleTitle)}>
                          {t("settingsProviders:mcpConfigEditor.editor.replaceArgs.title")}</p>
                        <p className={sx(styles.toggleHint)}>{t("settingsProviders:whole.hiddenArguments", { count: props.snapshot.argumentCount })}</p>
                      </div>
                      <Switch
                        checked={form.replaceArgs}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({
                            ...current,
                            replaceArgs: checked,
                          }))
                        }
                        aria-label={t("settingsProviders:mcpConfigEditor.editor.replaceArgs.ariaLabel")}
                      />
                    </div>
                  ) : null}
                  {!editing || form.replaceArgs ? (
                    <FormField
                      label={t("settingsProviders:mcpConfigEditor.editor.arguments")}
                      htmlFor={`${baseId}-args`}
                      description={t("settingsProviders:mcpConfigEditor.editor.argumentsHint")}
                    >
                      <Textarea
                        id={`${baseId}-args`}
                        value={form.argsText}
                        placeholder={"--yes\n@modelcontextprotocol/server"}
                        spellCheck={false}
                        className={sx(styles.monoAreaTall)}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            argsText: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                  ) : null}
                  <FormField
                    label={t("settingsProviders:mcpConfigEditor.editor.envVars")}
                    htmlFor={`${baseId}-env-vars`}
                    description={t("settingsProviders:mcpConfigEditor.editor.envVarsHint")}
                  >
                    <Textarea
                      id={`${baseId}-env-vars`}
                      value={form.envVarsText}
                      placeholder={"GITHUB_TOKEN\nWORKSPACE_ID"}
                      spellCheck={false}
                      className={sx(styles.monoAreaShort)}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          envVarsText: event.target.value,
                        }))
                      }
                    />
                  </FormField>
                </>
              ) : (
                <>
                  {editing && props.snapshot?.urlRedacted ? (
                    <div className={sx(styles.toggleRow)}>
                      <div>
                        <p className={sx(styles.toggleTitle)}>
                          {t("settingsProviders:mcpConfigEditor.editor.replaceUrl.title")}</p>
                        <p className={sx(styles.toggleHint)}>
                          {t("settingsProviders:mcpConfigEditor.editor.replaceUrl.hint")}</p>
                      </div>
                      <Switch
                        checked={form.replaceUrl}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({
                            ...current,
                            replaceUrl: checked,
                          }))
                        }
                        aria-label={t("settingsProviders:mcpConfigEditor.editor.replaceUrl.ariaLabel")}
                      />
                    </div>
                  ) : null}
                  {!editing || form.replaceUrl ? (
                    <FormField
                      label={/* i18n-ignore: protocol acronym */ "URL"}
                      htmlFor={`${baseId}-url`}
                      description={
                        formUsesCursorOfficialSlackClient(form) &&
                        formNeedsKiroSlackOAuthClientId(form)
                          ? t("settingsProviders:mcpConfigEditor.editor.urlHints.cursorAndKiro")
                          : formUsesCursorOfficialSlackClient(form)
                            ? t("settingsProviders:mcpConfigEditor.editor.urlHints.cursor")
                            : formNeedsKiroSlackOAuthClientId(form)
                              ? t("settingsProviders:mcpConfigEditor.editor.urlHints.kiro")
                              : undefined
                      }
                    >
                      <Input
                        id={`${baseId}-url`}
                        type="url"
                        value={form.url}
                        placeholder="https://mcp.example.com/mcp"
                        spellCheck={false}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            url: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                  ) : null}
                  {formShowsKiroOAuthClientIdField(form) ? (
                    <FormField
                      label={
                        formNeedsKiroSlackOAuthClientId(form)
                          ? t("settingsProviders:mcpConfigEditor.editor.oauthClientId.slackLabel")
                          : t("settingsProviders:mcpConfigEditor.editor.oauthClientId.label")
                      }
                      htmlFor={`${baseId}-oauth-client-id`}
                      description={
                        formNeedsKiroSlackOAuthClientId(form)
                          ? t("settingsProviders:mcpConfigEditor.editor.oauthClientId.slackHint")
                          : t("settingsProviders:mcpConfigEditor.editor.oauthClientId.hint")
                      }
                    >
                      <Input
                        id={`${baseId}-oauth-client-id`}
                        value={form.oauthClientId}
                        placeholder="1234567890.1234567890"
                        spellCheck={false}
                        autoComplete="off"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            oauthClientId: event.target.value,
                          }))
                        }
                      />
                    </FormField>
                  ) : null}
                  <FormField
                    label={t("settingsProviders:mcpConfigEditor.editor.bearer.label")}
                    htmlFor={`${baseId}-bearer`}
                    description={t("settingsProviders:mcpConfigEditor.editor.bearer.hint")}
                  >
                    <Input
                      id={`${baseId}-bearer`}
                      value={form.bearerTokenEnvVar}
                      placeholder="MCP_ACCESS_TOKEN"
                      spellCheck={false}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          bearerTokenEnvVar: event.target.value,
                        }))
                      }
                    />
                  </FormField>
                  <FormField
                    label={t("settingsProviders:mcpConfigEditor.editor.headers.label")}
                    htmlFor={`${baseId}-headers`}
                    description={t("settingsProviders:mcpConfigEditor.editor.headers.hint")}
                  >
                    <Textarea
                      id={`${baseId}-headers`}
                      value={form.headerBindingsText}
                      placeholder={"X-Workspace=WORKSPACE_ID"}
                      spellCheck={false}
                      className={sx(styles.monoAreaShort)}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          headerBindingsText: event.target.value,
                        }))
                      }
                    />
                  </FormField>
                </>
              )}

              {form.provider !== "claude-code" ? (
                <div className={sx(styles.toggleRowPlain)}>
                  <div>
                    <p className={sx(styles.toggleTitle)}>{t("common:status.enabled")}</p>
                    <p className={sx(styles.toggleHintTight)}>
                      {t("settingsProviders:mcpConfigEditor.editor.enabled.hint")}</p>
                  </div>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({
                        ...current,
                        enabled: checked,
                      }))
                    }
                    aria-label={t("settingsProviders:settingsDialogMcpConfigEditor.enableMCPServer", { value1: form.provider })}
                  />
                </div>
              ) : null}

              {editing && props.snapshot?.hiddenValueCount ? (
                <div className={sx(styles.protectedNote)}>{t("settingsProviders:whole.protectedValues", { count: props.snapshot.hiddenValueCount })}</div>
              ) : null}
            </form>
          )}

          {error ? (
            <p className={sx(styles.errorText)} role="alert">
              {error}
            </p>
          ) : null}
          <VisuallyHidden aria-live="polite" role="status">
            {busy
              ? preview
                ? t("settingsProviders:mcpConfigEditor.editor.status.applying")
                : t("settingsProviders:mcpConfigEditor.editor.status.preparing")
              : ""}
          </VisuallyHidden>
        </div>

        <DialogFooter className={sx(styles.footer)}>
          {preview ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setError("");
              }}
            >
              {t("common:actions.back")}</Button>
          ) : (
            <DialogClose render={<Button type="button" variant="outline" />}>
              {t("common:actions.cancel")}</DialogClose>
          )}
          <Button
            type={preview ? "button" : "submit"}
            form={preview ? undefined : `${baseId}-form`}
            disabled={busy}
            onClick={preview ? () => void applyChange() : undefined}
          >
            {busy
              ? preview
                ? t("settingsProviders:mcpConfigEditor.editor.applying")
                : t("settingsProviders:mcpConfigEditor.editor.preparing")
              : preview
                ? t("settingsProviders:mcpConfigEditor.editor.apply")
                : t("settingsProviders:mcpConfigEditor.editor.review")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function McpServerConfigDeleteDialog(props: {
  open: boolean;
  snapshot?: McpServerConfigSnapshot;
  workspaceCwd?: string;
  runtimeOptions: McpEditorRuntimeOptions;
  onOpenChange: (open: boolean) => void;
  onApplied: (detail: string) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [preview, setPreview] = useState<McpServerConfigMutationPreview | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!props.open || !props.snapshot) return;
    let cancelled = false;
    const snapshot = props.snapshot;
    const load = async () => {
      setBusy(true);
      setPreview(null);
      setError("");
      try {
        const api = window.api?.provider?.previewMcpServerConfigMutation;
        if (!api)
          throw new Error(i18n.t("settingsProviders:mcpConfigEditor.errors.previewUnavailable"));
        const result = await api({
          operation: "delete",
          target: {
            provider: snapshot.provider,
            scope: snapshot.scope,
            name: snapshot.name,
          },
          cwd: props.workspaceCwd,
          runtimeOptions: getRuntimeOptions(
            [snapshot.provider],
            props.runtimeOptions,
          ),
        });
        if (!result.ok || !result.preview) throw new Error(result.detail);
        if (!cancelled) setPreview(result.preview);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [props.open, props.runtimeOptions, props.snapshot, props.workspaceCwd]);

  async function confirmDelete() {
    if (!preview || !props.snapshot) return;
    const api = window.api?.provider?.applyMcpServerConfigMutation;
    if (!api) {
      setError(i18n.t("settingsProviders:messages.mcpApplyUnavailable"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api({
        operation: "delete",
        target: {
          provider: props.snapshot.provider,
          scope: props.snapshot.scope,
          name: props.snapshot.name,
        },
        cwd: props.workspaceCwd,
        runtimeOptions: getRuntimeOptions(
          [props.snapshot.provider],
          props.runtimeOptions,
        ),
        expectedRevision: preview.revision,
      });
      if (!result.ok) throw new Error(result.detail);
      props.onApplied(result.detail);
      props.onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!busy) props.onOpenChange(open);
      }}
    >
      <DialogContent showCloseButton={false} xstyle={styles.deleteSurface}>
        <DialogHeader>
          <div className={sx(styles.deleteTitleLine)}>
            <DialogTitle className={sx(styles.deleteTitle)}>
              {t("settingsProviders:mcpConfigEditor.delete.title")}</DialogTitle>
            {props.snapshot ? (
              <Badge variant="outline">{props.snapshot.sourceLabel}</Badge>
            ) : null}
          </div>
          <DialogDescription>
            {props.snapshot
              ? t("settingsProviders:settingsDialogMcpConfigEditor.thisRemovesFromConfigurationThisCannot", { value1: props.snapshot.name, value2: props.snapshot.sourceLabel })
              : t("settingsProviders:mcpConfigEditor.delete.descriptionFallback")}
          </DialogDescription>
        </DialogHeader>
        {busy && !preview ? (
          <p className={sx(styles.statusText)} role="status">
            {t("settingsProviders:mcpConfigEditor.checkingLatest")}</p>
        ) : null}
        {preview?.warnings.length ? (
          <div className={sx(styles.deleteWarning)}>
            {preview.warnings.join(" ")}
          </div>
        ) : null}
        {error ? (
          <p className={sx(styles.errorText)} role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            {t("common:actions.cancel")}</DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !preview}
            onClick={() => void confirmDelete()}
          >
            {busy ? t("settingsProviders:mcpConfigEditor.delete.deleting") : t("settingsProviders:mcpConfigEditor.delete.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function McpServerConfigShareDialog(props: {
  open: boolean;
  snapshot?: McpServerConfigSnapshot;
  destinationProvider?: McpConfigProvider;
  workspaceCwd?: string;
  runtimeOptions: McpEditorRuntimeOptions;
  onOpenChange: (open: boolean) => void;
  onApplied: (detail: string) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const destinationProvider = props.destinationProvider;
  const destinationScope =
    props.snapshot && destinationProvider
      ? resolveMcpShareDestinationScope({
          sourceScope: props.snapshot.scope,
          destinationProvider,
        })
      : "user";
  const destinationLabel =
    destinationProvider === "claude-code"
      ? "Claude"
      : destinationProvider === "codex"
        ? "Codex"
        : destinationProvider === "cursor"
          ? "Cursor"
          : "Kiro";
  const [preview, setPreview] = useState<McpServerConfigMutationPreview | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!props.open || !props.snapshot || !destinationProvider) return;
    let cancelled = false;
    const snapshot = props.snapshot;
    const load = async () => {
      setBusy(true);
      setPreview(null);
      setError("");
      try {
        const api = window.api?.provider?.previewMcpServerConfigMutation;
        if (!api)
          throw new Error(i18n.t("settingsProviders:mcpConfigEditor.errors.previewUnavailable"));
        const result = await api({
          operation: "share",
          target: {
            provider: snapshot.provider,
            scope: snapshot.scope,
            name: snapshot.name,
          },
          destination: {
            provider: destinationProvider,
            scope: destinationScope,
            name: snapshot.name,
          },
          cwd: props.workspaceCwd,
          runtimeOptions: getRuntimeOptions(
            [snapshot.provider, destinationProvider],
            props.runtimeOptions,
          ),
        });
        if (!result.ok || !result.preview) throw new Error(result.detail);
        if (!cancelled) setPreview(result.preview);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [
    destinationProvider,
    destinationScope,
    props.open,
    props.runtimeOptions,
    props.snapshot,
    props.workspaceCwd,
  ]);

  async function confirmShare() {
    if (!preview || !props.snapshot || !destinationProvider) return;
    const api = window.api?.provider?.applyMcpServerConfigMutation;
    if (!api) {
      setError(i18n.t("settingsProviders:messages.mcpApplyUnavailable"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api({
        operation: "share",
        target: {
          provider: props.snapshot.provider,
          scope: props.snapshot.scope,
          name: props.snapshot.name,
        },
        destination: {
          provider: destinationProvider,
          scope: destinationScope,
          name: props.snapshot.name,
        },
        cwd: props.workspaceCwd,
        runtimeOptions: getRuntimeOptions(
          [props.snapshot.provider, destinationProvider],
          props.runtimeOptions,
        ),
        expectedRevision: preview.revision,
      });
      if (!result.ok) throw new Error(result.detail);
      props.onApplied(result.detail);
      props.onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!busy) props.onOpenChange(open);
      }}
    >
      <DialogContent xstyle={styles.shareSurface}>
        <DialogHeader className={sx(styles.headerBlock)}>
          <DialogTitle className={sx(styles.headerTitle)}>{t("settingsProviders:whole.addMcp", { destination: destinationLabel })}</DialogTitle>
          <DialogDescription className={sx(styles.headerDescription)}>{t("settingsProviders:whole.shareMcp", { destination: destinationLabel })}</DialogDescription>
        </DialogHeader>
        <div className={sx(styles.scrollArea)}>
          {busy && !preview ? (
            <p className={sx(styles.statusText)} role="status">
              {t("settingsProviders:mcpConfigEditor.checkingLatest")}</p>
          ) : null}
          {preview ? <ReviewPanel preview={preview} /> : null}
          {error ? (
            <p className={sx(styles.errorText)} role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter className={sx(styles.footer)}>
          <DialogClose render={<Button type="button" variant="outline" />}>
            {t("common:actions.cancel")}</DialogClose>
          <Button
            type="button"
            disabled={busy || !preview}
            onClick={() => void confirmShare()}
          >
            {busy ? t("settingsProviders:mcpConfigEditor.share.adding") : t("settingsProviders:settingsDialogMcpConfigEditor.addTo", { value1: destinationLabel })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
