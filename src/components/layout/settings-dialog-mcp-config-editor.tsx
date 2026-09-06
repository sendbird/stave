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
      ? { claudeBinaryPath: options.claude.claudeBinaryPath }
      : {}),
    ...(providers.includes("codex")
      ? { codexBinaryPath: options.codex.codexBinaryPath }
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
          <p className={sx(styles.warningTitle)}>Before you apply</p>
          <ul className={sx(styles.warningList)}>
            {props.preview.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className={sx(styles.reviewNote)}>
        Stave will verify that the provider configuration has not changed since
        this preview before writing it.
      </p>
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
      if (!request) throw new Error("MCP configuration form is incomplete.");
      const api = window.api?.provider?.previewMcpServerConfigMutation;
      if (!api)
        throw new Error("MCP configuration preview API is unavailable.");
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
      setError("MCP configuration apply API is unavailable.");
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
            {editing ? "Edit MCP server" : "Add MCP server"}
          </DialogTitle>
          <DialogDescription className={sx(styles.headerDescription)}>
            Credentials stay outside Stave: bind authentication through
            environment-variable names, then review the native provider change
            before applying it.
          </DialogDescription>
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
                  label={editing ? "Provider" : "Install to"}
                  htmlFor={`${baseId}-provider`}
                  description={
                    editing
                      ? undefined
                      : form.installProviders.length > 1
                        ? "One review writes provider-native copies for every selected target."
                        : "Register once, or add another provider later from the connection list."
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
                            aria-label={`Install to ${label}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </FormField>
                <FormField
                  label="Scope"
                  htmlFor={`${baseId}-scope`}
                  description={
                    form.installProviders.includes("codex") &&
                    form.installProviders.length === 1
                      ? "Codex App Server currently supports safe writes to user scope."
                      : form.installProviders.includes("codex") &&
                          form.scope !== "user"
                        ? "Project-capable providers use this scope. Codex receives a user-scope copy."
                        : "Project is shared in .mcp.json; local stays private to this workspace."
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
                      <SelectItem value="user">User</SelectItem>
                      {form.installProviders.includes("claude-code") ||
                      form.installProviders.includes("cursor") ||
                      form.installProviders.includes("kiro") ? (
                        <SelectItem
                          value="project"
                          disabled={!props.workspaceCwd}
                        >
                          Project
                        </SelectItem>
                      ) : null}
                      {form.installProviders.includes("claude-code") ? (
                        <SelectItem
                          value="local"
                          disabled={!props.workspaceCwd}
                        >
                          Local project
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              <div className={sx(styles.columns)}>
                <FormField label="Server name" htmlFor={`${baseId}-name`}>
                  <Input
                    id={`${baseId}-name`}
                    autoFocus
                    value={form.name}
                    placeholder="github"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </FormField>
                <FormField label="Transport" htmlFor={`${baseId}-transport`}>
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
                      <SelectItem value="stdio">stdio</SelectItem>
                      <SelectItem value="http">HTTP</SelectItem>
                      {!form.installProviders.includes("codex") ? (
                        <SelectItem value="sse">SSE (legacy)</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              {form.transport === "stdio" ? (
                <>
                  <FormField label="Command" htmlFor={`${baseId}-command`}>
                    <Input
                      id={`${baseId}-command`}
                      value={form.command}
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
                          Replace command arguments
                        </p>
                        <p className={sx(styles.toggleHint)}>
                          {props.snapshot.argumentCount === 1
                            ? "1 existing argument is hidden"
                            : `${props.snapshot.argumentCount} existing arguments are hidden`}{" "}
                          Leave this off to preserve them.
                        </p>
                      </div>
                      <Switch
                        checked={form.replaceArgs}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({
                            ...current,
                            replaceArgs: checked,
                          }))
                        }
                        aria-label="Replace existing MCP command arguments"
                      />
                    </div>
                  ) : null}
                  {!editing || form.replaceArgs ? (
                    <FormField
                      label="Arguments"
                      htmlFor={`${baseId}-args`}
                      description="One argument per line. Empty lines are ignored."
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
                    label="Inherited environment variables"
                    htmlFor={`${baseId}-env-vars`}
                    description="One variable name per line. Stave writes references only, never values."
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
                          Replace remote URL
                        </p>
                        <p className={sx(styles.toggleHint)}>
                          Credentials or query details are hidden. Leave this
                          off to preserve the complete URL.
                        </p>
                      </div>
                      <Switch
                        checked={form.replaceUrl}
                        onCheckedChange={(checked) =>
                          setForm((current) => ({
                            ...current,
                            replaceUrl: checked,
                          }))
                        }
                        aria-label="Replace redacted MCP URL"
                      />
                    </div>
                  ) : null}
                  {!editing || form.replaceUrl ? (
                    <FormField label="URL" htmlFor={`${baseId}-url`}>
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
                  <FormField
                    label="Bearer token environment variable"
                    htmlFor={`${baseId}-bearer`}
                    description="Optional. Enter the variable name, not the token."
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
                    label="Header environment bindings"
                    htmlFor={`${baseId}-headers`}
                    description="One Header-Name=ENV_VAR binding per line."
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
                    <p className={sx(styles.toggleTitle)}>Enabled</p>
                    <p className={sx(styles.toggleHintTight)}>
                      Disabled servers stay in the provider's native
                      configuration without connecting.
                    </p>
                  </div>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(checked) =>
                      setForm((current) => ({
                        ...current,
                        enabled: checked,
                      }))
                    }
                    aria-label={`Enable ${form.provider} MCP server`}
                  />
                </div>
              ) : null}

              {editing && props.snapshot?.hiddenValueCount ? (
                <div className={sx(styles.protectedNote)}>
                  <span className={sx(styles.protectedStrong)}>
                    Protected existing values.
                  </span>{" "}
                  {props.snapshot.hiddenValueCount === 1
                    ? "1 sensitive or opaque value is hidden"
                    : `${props.snapshot.hiddenValueCount} sensitive or opaque values are hidden`}{" "}
                  from this dialog and preserved when the transport remains
                  compatible.
                </div>
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
                ? "Applying MCP configuration"
                : "Preparing MCP configuration preview"
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
              Back
            </Button>
          ) : (
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
          )}
          <Button
            type={preview ? "button" : "submit"}
            form={preview ? undefined : `${baseId}-form`}
            disabled={busy}
            onClick={preview ? () => void applyChange() : undefined}
          >
            {busy
              ? preview
                ? "Applying…"
                : "Preparing…"
              : preview
                ? "Apply change"
                : "Review change"}
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
          throw new Error("MCP configuration preview API is unavailable.");
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
      setError("MCP configuration apply API is unavailable.");
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
              Delete MCP server?
            </DialogTitle>
            {props.snapshot ? (
              <Badge variant="outline">{props.snapshot.sourceLabel}</Badge>
            ) : null}
          </div>
          <DialogDescription>
            {props.snapshot
              ? `This removes ${props.snapshot.name} from ${props.snapshot.sourceLabel} configuration. This cannot be undone from Stave.`
              : "This removes the selected MCP server configuration."}
          </DialogDescription>
        </DialogHeader>
        {busy && !preview ? (
          <p className={sx(styles.statusText)} role="status">
            Checking the latest provider configuration…
          </p>
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
            Cancel
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !preview}
            onClick={() => void confirmDelete()}
          >
            {busy ? "Deleting…" : "Delete server"}
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
          throw new Error("MCP configuration preview API is unavailable.");
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
      setError("MCP configuration apply API is unavailable.");
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
          <DialogTitle className={sx(styles.headerTitle)}>
            Add to {destinationLabel}
          </DialogTitle>
          <DialogDescription className={sx(styles.headerDescription)}>
            Copy this server into {destinationLabel} using the same name,
            transport, and environment-variable bindings. Opaque values stay in
            the source and are not copied.
          </DialogDescription>
        </DialogHeader>
        <div className={sx(styles.scrollArea)}>
          {busy && !preview ? (
            <p className={sx(styles.statusText)} role="status">
              Checking the latest provider configuration…
            </p>
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
            Cancel
          </DialogClose>
          <Button
            type="button"
            disabled={busy || !preview}
            onClick={() => void confirmShare()}
          >
            {busy ? "Adding…" : `Add to ${destinationLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
