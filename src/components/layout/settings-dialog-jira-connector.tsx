import { useEffect, useRef, useState } from "react";
import { KeyRound, Plug, RotateCcw, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Loader,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  toast,
} from "@/components/ui";
import {
  DEFAULT_JIRA_JQL,
  MAX_JIRA_MAX_RESULTS,
  normalizeJiraSiteUrl,
  type JiraConnectorPublicStatus,
} from "@/lib/jira-connector/types";
import { useAppStore } from "@/store/app.store";

// Security posture: the email and token are write-only from the renderer. They
// leave through `setCredential`, the main process verifies and vaults them, and
// the status that returns carries neither - so the form clears both fields on
// save and shows `accountId`/`displayName` as the only proof a credential
// works. Re-rendering a masked token from local state would be theatre, not a
// read-back. Failure copy is derived from `lastErrorCode` alone because a Jira
// error body can quote the JQL and request headers.
const ERROR_COPY: Record<string, string> = {
  unauthorized: "Jira rejected the email and API token.",
  forbidden: "This account cannot read the requested issues.",
  invalid_jql: "Jira rejected the search query.",
  not_found: "The site responded, but the resource was not found.",
  rate_limited: "Jira is rate limiting requests. Try again shortly.",
  server_error: "Jira reported a server error.",
  network_unavailable: "Jira could not be reached from this machine.",
  response_too_large: "The Jira response was too large to read.",
  invalid_response: "Jira returned an unexpected response.",
  not_configured: "Add a site URL and an API token first.",
  secure_storage_unavailable: "OS credential encryption is unavailable.",
  request_failed: "The Jira request failed.",
};

function errorCopy(code: string | null | undefined): string {
  return (code ? ERROR_COPY[code] : undefined) ?? ERROR_COPY.request_failed!;
}

/** How long a settings edit waits before it is pushed to the main process. */
const CONFIGURE_DEBOUNCE_MS = 400;
const MAX_RESULTS_OPTIONS = [25, 50, MAX_JIRA_MAX_RESULTS] as const;
const PROJECT_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const HINT = "text-xs leading-5 text-muted-foreground";

type BusyKey = "credential" | "clear" | "test";
type JiraReply = { ok: boolean; status: JiraConnectorPublicStatus };

export function JiraConnectorSettingsSection() {
  const connector = useAppStore((state) => state.settings.jiraConnector);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const projects = useAppStore((state) => state.recentProjects);

  const [status, setStatus] = useState<JiraConnectorPublicStatus | null>(null);
  const [siteUrl, setSiteUrl] = useState(connector.siteUrl);
  const [siteUrlError, setSiteUrlError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [mappingKey, setMappingKey] = useState("");
  const [mappingPath, setMappingPath] = useState("");
  const [busy, setBusy] = useState<BusyKey | null>(null);
  const [testCode, setTestCode] = useState<string | null | "ok">(null);

  useEffect(() => setSiteUrl(connector.siteUrl), [connector.siteUrl]);

  useEffect(() => {
    let cancelled = false;
    void window.api?.jiraConnector
      ?.getStatus?.()
      .then((result) => {
        if (!cancelled && result) setStatus(result.status);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // The main process keeps its own copy of these settings for polling, so every
  // edit is pushed. Debounced through a ref because the JQL box changes per
  // keystroke and each push throws away the cached HTTP client.
  const latest = useRef(connector);
  latest.current = connector;
  useEffect(() => {
    const configure = window.api?.jiraConnector?.configure;
    if (!configure) return;
    const timer = setTimeout(() => {
      void configure(latest.current)
        .then((result) => setStatus(result.status))
        .catch(() => undefined);
    }, CONFIGURE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [connector]);

  const save = (patch: Partial<typeof connector>) =>
    updateSettings({ patch: { jiraConnector: { ...connector, ...patch } } });

  const invoke = async (
    key: BusyKey,
    call: (() => Promise<JiraReply>) | undefined | null,
  ): Promise<JiraReply | null> => {
    if (!call) {
      toast.error("Jira connector controls are unavailable.");
      return null;
    }
    setBusy(key);
    try {
      const result = await call();
      setStatus(result.status);
      return result;
    } catch {
      return null;
    } finally {
      setBusy(null);
    }
  };

  const commitSiteUrl = () => {
    const raw = siteUrl.trim();
    // An empty site is "not set yet", not invalid: the rest of the row still
    // has to be editable before a site exists.
    if (raw.length === 0) {
      setSiteUrlError(null);
      setSiteUrl("");
      save({ siteUrl: "" });
      return;
    }
    try {
      const normalized = normalizeJiraSiteUrl(raw);
      setSiteUrlError(null);
      setSiteUrl(normalized);
      save({ siteUrl: normalized });
    } catch (error) {
      setSiteUrlError(
        error instanceof Error ? error.message : "Enter a valid Jira site URL.",
      );
    }
  };

  const saveCredential = async () => {
    const call = window.api?.jiraConnector?.setCredential;
    const result = await invoke(
      "credential",
      call && (() => call({ email: email.trim(), token: token.trim() })),
    );
    if (!result) return;
    if (!result.ok) {
      toast.error("Jira did not accept the credential", {
        description: errorCopy(result.status.lastErrorCode),
      });
      return;
    }
    // Dropped the moment the vault owns them, so the token never lingers in
    // renderer memory for the life of the dialog.
    setEmail("");
    setToken("");
    setReplacing(false);
    setTestCode("ok");
    toast.success("Jira credential stored.");
  };

  const clearCredential = async () => {
    const call = window.api?.jiraConnector?.clearCredential;
    if (!(await invoke("clear", call && (() => call())))) return;
    setTestCode(null);
    setReplacing(false);
    toast.success("Jira credential removed from this device.");
  };

  const testConnection = async () => {
    const call = window.api?.jiraConnector?.testConnection;
    const result = await invoke("test", call && (() => call()));
    setTestCode(
      !result
        ? "request_failed"
        : result.ok
          ? "ok"
          : result.status.lastErrorCode,
    );
  };

  const addMapping = () => {
    const key = mappingKey.trim().toUpperCase();
    if (!PROJECT_KEY_PATTERN.test(key) || mappingPath.length === 0) {
      toast.error("Enter a Jira project key and pick a registered project.");
      return;
    }
    if (connector.projectMappings.some((row) => row.jiraProjectKey === key)) {
      toast.error(`${key} is already mapped.`);
      return;
    }
    save({
      projectMappings: [
        ...connector.projectMappings,
        { jiraProjectKey: key, staveProjectPath: mappingPath },
      ],
    });
    setMappingKey("");
    setMappingPath("");
  };

  const configured = status?.configured === true;
  const canStore = status?.secureStorageAvailable !== false;
  const spinner = (key: BusyKey, Icon: typeof KeyRound) =>
    busy === key ? (
      <Loader aria-hidden size="xs" variant="signal" />
    ) : (
      <Icon className="size-4" aria-hidden="true" />
    );

  return (
    <div
      id="settings-field-jira-connector"
      tabIndex={-1}
      className="rounded-xl border border-border bg-card"
    >
      <div className="flex items-start gap-3 border-b border-border/70 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Jira</h3>
            <Badge variant={configured ? "success" : "outline"}>
              {configured ? "Credential stored" : "Not connected"}
            </Badge>
          </div>
          <p className={`mt-1 ${HINT}`}>
            Read your assigned issues over outbound HTTPS. The API token stays
            in this machine&apos;s credential vault and is never readable here.
          </p>
        </div>
        <Switch
          aria-label="Enable Jira as a task source"
          checked={connector.enabled}
          disabled={busy !== null}
          onCheckedChange={(checked) => save({ enabled: checked })}
        />
      </div>

      <div className="space-y-5 px-5 py-4">
        <div className="grid gap-2">
          <span className="text-xs font-medium">Site URL</span>
          <Input
            aria-label="Jira site URL"
            aria-invalid={siteUrlError !== null}
            value={siteUrl}
            placeholder="https://your-team.atlassian.net"
            onChange={(event) => setSiteUrl(event.target.value)}
            onBlur={commitSiteUrl}
            autoComplete="url"
          />
          <p className={siteUrlError ? `${HINT} text-destructive` : HINT}>
            {siteUrlError ??
              "HTTPS only. A path prefix is kept, so a site proxied at /jira works."}
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/25 p-4">
          <h4 className="text-sm font-medium">API token</h4>
          <p className={HINT}>
            Create a token in your Atlassian account settings. It is verified
            once, then stored encrypted and never read back into this window.
          </p>

          {configured ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {status?.displayName ?? "Connected account"}
                </p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {status?.accountId ?? "Account id unavailable"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => {
                    setEmail("");
                    setToken("");
                    setReplacing(!replacing);
                  }}
                >
                  {replacing ? "Cancel" : "Replace"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => void clearCredential()}
                >
                  {spinner("clear", Trash2)}
                  Clear
                </Button>
              </div>
            </div>
          ) : null}

          {configured && !replacing ? null : (
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Input
                aria-label="Jira account email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={320}
                autoComplete="off"
              />
              <Input
                aria-label="Jira API token"
                type="password"
                placeholder="API token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                maxLength={512}
                autoComplete="off"
              />
              <Button
                type="button"
                disabled={
                  busy !== null || !email.trim() || !token.trim() || !canStore
                }
                onClick={() => void saveCredential()}
              >
                {spinner("credential", KeyRound)}
                Save
              </Button>
            </div>
          )}

          {canStore ? null : (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
              OS credential encryption is unavailable, so the token cannot be
              stored safely. Saving stays blocked until it returns.
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <span className="text-xs font-medium">Issue query (JQL)</span>
          <Textarea
            aria-label="Jira issue query"
            value={connector.jql}
            rows={3}
            maxLength={2_000}
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(event) => save({ jql: event.target.value })}
          />
          <div className="flex items-center justify-between gap-3">
            <p className={HINT}>
              Runs as the token holder. Keep it narrow: every refresh fetches
              this whole result page.
            </p>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-auto shrink-0 py-1 text-xs"
              disabled={connector.jql === DEFAULT_JIRA_JQL}
              onClick={() => save({ jql: DEFAULT_JIRA_JQL })}
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              Reset to default
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={String(connector.maxResults)}
            disabled={busy !== null}
            onValueChange={(value) => save({ maxResults: Number(value) })}
          >
            <SelectTrigger aria-label="Issues per refresh" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAX_RESULTS_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option} issues per refresh
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null || !configured}
            onClick={() => void testConnection()}
          >
            {spinner("test", Plug)}
            Test connection
          </Button>
          {testCode === null ? null : (
            <Badge variant={testCode === "ok" ? "success" : "destructive"}>
              {testCode === "ok" ? "Connection works" : errorCopy(testCode)}
            </Badge>
          )}
        </div>

        <div className="space-y-3 border-t border-border/70 pt-4">
          <h4 className="text-sm font-medium">Project mappings</h4>
          <p className={HINT}>
            A Jira project key preselects a registered Stave project when a
            ticket starts a run. Local paths never leave this device.
          </p>

          {connector.projectMappings.map((mapping, index) => (
            <div
              key={mapping.jiraProjectKey}
              className="flex items-center gap-3 rounded-lg border border-border bg-muted/25 px-3 py-2"
            >
              <Badge variant="secondary">{mapping.jiraProjectKey}</Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {projects.find(
                    (p) => p.projectPath === mapping.staveProjectPath,
                  )?.projectName ?? "Unregistered project"}
                </p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {mapping.staveProjectPath}
                </p>
              </div>
              {mapping.runtime ? (
                <Badge variant="outline">
                  {mapping.runtime.provider} · {mapping.runtime.model}
                </Badge>
              ) : null}
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove the ${mapping.jiraProjectKey} project mapping`}
                onClick={() =>
                  save({
                    projectMappings: connector.projectMappings.filter(
                      (_, position) => position !== index,
                    ),
                  })
                }
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}

          <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto]">
            <Input
              aria-label="Jira project key"
              value={mappingKey}
              onChange={(event) => setMappingKey(event.target.value)}
              placeholder="PLAT"
              maxLength={64}
              autoComplete="off"
            />
            <Select value={mappingPath} onValueChange={setMappingPath}>
              <SelectTrigger aria-label="Stave project">
                <SelectValue placeholder="Select a registered project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem
                    key={project.projectPath}
                    value={project.projectPath}
                  >
                    {project.projectName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={addMapping}>
              Add mapping
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
