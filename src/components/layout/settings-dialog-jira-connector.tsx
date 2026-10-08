import { i18n, I18N_NAMESPACES, useTranslation } from "@/i18n";
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
import { sx } from "@/components/ads/utils/stylex";
import {
  DEFAULT_JIRA_JQL,
  MAX_JIRA_MAX_RESULTS,
  normalizeJiraSiteUrl,
  type JiraConnectorPublicStatus,
} from "@/lib/jira-connector/types";
import { useAppStore } from "@/store/app.store";
import {
  buildJiraEnablementPatch,
  isJiraSourceEnabled,
} from "@/lib/tracker-issues/jira-enablement";
import { jiraConnectorStyles as styles } from "./settings-dialog-jira-connector.styles";

// Security posture: the email and token are write-only from the renderer. They
// leave through `setCredential`, the main process verifies and vaults them, and
// the status that returns carries neither - so the form clears both fields on
// save and shows `accountId`/`displayName` as the only proof a credential
// works. Re-rendering a masked token from local state would be theatre, not a
// read-back. Failure copy is derived from `lastErrorCode` alone because a Jira
// error body can quote the JQL and request headers.
const ERROR_COPY: Record<string, string> = {
  get unauthorized() { return i18n.t("settingsConnections:settingsDialogJiraConnector.jiraRejectedTheEmailAndAPI"); },
  get forbidden() { return i18n.t("settingsConnections:settingsDialogJiraConnector.thisAccountCannotReadTheRequested"); },
  get invalid_jql() { return i18n.t("settingsConnections:settingsDialogJiraConnector.jiraRejectedTheSearchQuery"); },
  get not_found() { return i18n.t("settingsConnections:settingsDialogJiraConnector.theSiteRespondedButTheResource"); },
  get rate_limited() { return i18n.t("settingsConnections:settingsDialogJiraConnector.jiraIsRateLimitingRequestsTry"); },
  get server_error() { return i18n.t("settingsConnections:settingsDialogJiraConnector.jiraReportedAServerError"); },
  get network_unavailable() { return i18n.t("settingsConnections:settingsDialogJiraConnector.jiraCouldNotBeReachedFrom"); },
  get response_too_large() { return i18n.t("settingsConnections:settingsDialogJiraConnector.theJiraResponseWasTooLarge"); },
  get invalid_response() { return i18n.t("settingsConnections:settingsDialogJiraConnector.jiraReturnedAnUnexpectedResponse"); },
  get not_configured() { return i18n.t("settingsConnections:settingsDialogJiraConnector.addASiteURLAndAn"); },
  get secure_storage_unavailable() { return i18n.t("settingsConnections:settingsDialogJiraConnector.osCredentialEncryptionIsUnavailable"); },
  get request_failed() { return i18n.t("settingsConnections:settingsDialogJiraConnector.theJiraRequestFailed"); },
};

function errorCopy(code: string | null | undefined): string {
  return (code ? ERROR_COPY[code] : undefined) ?? ERROR_COPY.request_failed!;
}

/** How long a settings edit waits before it is pushed to the main process. */
const CONFIGURE_DEBOUNCE_MS = 400;
const MAX_RESULTS_OPTIONS = [25, 50, MAX_JIRA_MAX_RESULTS] as const;
const PROJECT_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

type BusyKey = "credential" | "clear" | "test";
type JiraReply = { ok: boolean; status: JiraConnectorPublicStatus };

export function JiraConnectorSettingsSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const connector = useAppStore((state) => state.settings.jiraConnector);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const repositories = useAppStore((state) => state.recentRepositories);

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

  // Integrations owns Jira's on/off; this switch shows and writes both keys
  // that gate polling. Issues → Sources only links here.
  const jiraEnabled = useAppStore((state) => isJiraSourceEnabled(state.settings));
  const setJiraEnabled = (checked: boolean) =>
    updateSettings({
      patch: buildJiraEnablementPatch({
        settings: useAppStore.getState().settings,
        enabled: checked,
      }),
    });

  const invoke = async (
    key: BusyKey,
    call: (() => Promise<JiraReply>) | undefined | null,
  ): Promise<JiraReply | null> => {
    if (!call) {
      toast.error(i18n.t("settingsConnections:settingsDialogJiraConnector.jiraConnectorControlsAreUnavailable"));
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
        error instanceof Error ? error.message : i18n.t("settingsConnections:settingsDialogJiraConnector.enterAValidJiraSiteURL"),
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
      toast.error(i18n.t("settingsConnections:settingsDialogJiraConnector.jiraDidNotAcceptTheCredential"), {
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
    toast.success(i18n.t("settingsConnections:settingsDialogJiraConnector.jiraCredentialStored"));
  };

  const clearCredential = async () => {
    const call = window.api?.jiraConnector?.clearCredential;
    if (!(await invoke("clear", call && (() => call())))) return;
    setTestCode(null);
    setReplacing(false);
    toast.success(i18n.t("settingsConnections:settingsDialogJiraConnector.jiraCredentialRemovedFromThisDevice"));
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
      toast.error(i18n.t("settingsConnections:settingsDialogJiraConnector.enterAJiraProjectKeyAnd"));
      return;
    }
    if (connector.repositoryMappings.some((row) => row.jiraProjectKey === key)) {
      toast.error(i18n.t("settingsConnections:settingsDialogJiraConnector.isAlreadyMapped", { value1: key }));
      return;
    }
    save({
      repositoryMappings: [
        ...connector.repositoryMappings,
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
      <Icon className={sx(styles.actionIcon)} aria-hidden="true" />
    );

  return (
    <div
      id="settings-field-jira-connector"
      tabIndex={-1}
      className={sx(styles.root)}
    >
      <div className={sx(styles.header)}>
        <div className={sx(styles.headerBody)}>
          <div className={sx(styles.headerTitleLine)}>
            <h3 className={sx(styles.headerTitle)}>Jira</h3>
            <Badge variant={configured ? "success" : "outline"}>
              {configured ? t("settingsConnections:settingsDialogJiraConnector.credentialStored") : t("settingsConnections:settingsDialogJiraConnector.notConnected")}
            </Badge>
          </div>
          <p className={sx(styles.headerHint)}>
            {t("settingsConnections:settingsDialogJiraConnector.readYourAssignedIssuesOverOutbound")}</p>
        </div>
        <Switch
          aria-label={t("settingsConnections:settingsDialogJiraConnector.enableJiraAsATaskSource")}
          checked={jiraEnabled}
          disabled={busy !== null}
          onCheckedChange={setJiraEnabled}
        />
      </div>

      <div className={sx(styles.body)}>
        <div className={sx(styles.field)}>
          <span className={sx(styles.fieldLabel)}>{t("settingsConnections:settingsDialogJiraConnector.siteURL")}</span>
          <Input
            aria-label={t("settingsConnections:settingsDialogJiraConnector.jiraSiteURL")}
            aria-invalid={siteUrlError !== null}
            value={siteUrl}
            placeholder="https://your-team.atlassian.net"
            onChange={(event) => setSiteUrl(event.target.value)}
            onBlur={commitSiteUrl}
            autoComplete="url"
          />
          <p
            className={sx(
              styles.hint,
              siteUrlError != null && styles.hintError,
            )}
          >
            {siteUrlError ??
              t("settingsConnections:settingsDialogJiraConnector.httpsOnlyAPathPrefixIs")}
          </p>
        </div>

        <div className={sx(styles.tokenPanel)}>
          <h4 className={sx(styles.panelTitle)}>{t("settingsConnections:settingsDialogJiraConnector.apiToken")}</h4>
          <p className={sx(styles.hint)}>
            {t("settingsConnections:settingsDialogJiraConnector.createATokenInYourAtlassian")}</p>

          {configured ? (
            <div className={sx(styles.accountRow)}>
              <div className={sx(styles.accountMeta)}>
                <p className={sx(styles.accountName)}>
                  {status?.displayName ?? t("settingsConnections:settingsDialogJiraConnector.connectedAccount")}
                </p>
                <p className={sx(styles.accountId)}>
                  {status?.accountId ?? t("settingsConnections:settingsDialogJiraConnector.accountIdUnavailable")}
                </p>
              </div>
              <div className={sx(styles.accountActions)}>
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
                  {replacing ? t("common:actions.cancel") : t("settings:general.soundControls.replace")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => void clearCredential()}
                >
                  {spinner("clear", Trash2)}
                  {t("common:actions.clear")}</Button>
              </div>
            </div>
          ) : null}

          {configured && !replacing ? null : (
            <div className={sx(styles.credentialGrid)}>
              <Input
                aria-label={t("settingsConnections:settingsDialogJiraConnector.jiraAccountEmail")}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={320}
                autoComplete="off"
              />
              <Input
                aria-label={t("settingsConnections:settingsDialogJiraConnector.jiraAPIToken")}
                type="password"
                placeholder={t("settingsConnections:settingsDialogJiraConnector.apiToken")}
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
                {t("common:actions.save")}</Button>
            </div>
          )}

          {canStore ? null : (
            <p className={sx(styles.warning)}>
              {t("settingsConnections:settingsDialogJiraConnector.osCredentialEncryptionIsUnavailableSo")}</p>
          )}
        </div>

        <div className={sx(styles.field)}>
          <span className={sx(styles.fieldLabel)}>{t("settingsConnections:settingsDialogJiraConnector.issueQueryJQL")}</span>
          <Textarea
            aria-label={t("settingsConnections:settingsDialogJiraConnector.jiraIssueQuery")}
            value={connector.jql}
            rows={3}
            maxLength={2_000}
            spellCheck={false}
            className={sx(styles.jqlArea)}
            onChange={(event) => save({ jql: event.target.value })}
          />
          <div className={sx(styles.jqlFooter)}>
            <p className={sx(styles.hint)}>
              {t("settingsConnections:settingsDialogJiraConnector.runsAsTheTokenHolderKeep")}</p>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className={sx(styles.resetButton)}
              disabled={connector.jql === DEFAULT_JIRA_JQL}
              onClick={() => save({ jql: DEFAULT_JIRA_JQL })}
            >
              <RotateCcw className={sx(styles.resetIcon)} aria-hidden="true" />
              {t("settings:reviewCards.tasks.followUp.resetToDefault")}</Button>
          </div>
        </div>

        <div className={sx(styles.refreshRow)}>
          <Select
            value={String(connector.maxResults)}
            disabled={busy !== null}
            onValueChange={(value) => save({ maxResults: Number(value) })}
          >
            <SelectTrigger
              aria-label={t("settingsConnections:settingsDialogJiraConnector.issuesPerRefresh")}
              className={sx(styles.maxResultsTrigger)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAX_RESULTS_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>{t("settingsConnections:messages.refreshIssues", { count: option })}</SelectItem>
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
            {t("settingsConnections:settingsDialogJiraConnector.testConnection")}</Button>
          {testCode === null ? null : (
            <Badge variant={testCode === "ok" ? "success" : "destructive"}>
              {testCode === "ok" ? t("settingsConnections:settingsDialogJiraConnector.connectionWorks") : errorCopy(testCode)}
            </Badge>
          )}
        </div>

        <div className={sx(styles.mappings)}>
          <h4 className={sx(styles.panelTitle)}>{t("settingsConnections:settingsDialogJiraConnector.projectMappings")}</h4>
          <p className={sx(styles.hint)}>
            {t("settingsConnections:settingsDialogJiraConnector.aJiraProjectKeyPreselectsA")}</p>

          {connector.repositoryMappings.map((mapping, index) => (
            <div key={mapping.jiraProjectKey} className={sx(styles.mappingRow)}>
              <Badge variant="secondary">{mapping.jiraProjectKey}</Badge>
              <div className={sx(styles.mappingBody)}>
                <p className={sx(styles.mappingName)}>
                  {repositories.find(
                    (p) => p.repositoryPath === mapping.staveProjectPath,
                  )?.repositoryName ?? i18n.t("settingsConnections:settingsDialogJiraConnector.unregisteredProject")}
                </p>
                <p className={sx(styles.mappingPath)}>
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
                aria-label={i18n.t("settingsConnections:settingsDialogJiraConnector.removeTheProjectMapping", { value1: mapping.jiraProjectKey })}
                onClick={() =>
                  save({
                    repositoryMappings: connector.repositoryMappings.filter(
                      (_, position) => position !== index,
                    ),
                  })
                }
              >
                <Trash2 className={sx(styles.actionIcon)} aria-hidden="true" />
              </Button>
            </div>
          ))}

          <div className={sx(styles.mappingForm)}>
            <Input
              aria-label={t("settingsConnections:settingsDialogJiraConnector.jiraProjectKey")}
              value={mappingKey}
              onChange={(event) => setMappingKey(event.target.value)}
              placeholder={t("settingsConnections:settingsDialogJiraConnector.plat")}
              maxLength={64}
              autoComplete="off"
            />
            <Select value={mappingPath} onValueChange={setMappingPath}>
              <SelectTrigger aria-label={t("settingsConnections:settingsDialogJiraConnector.staveProject")}>
                <SelectValue placeholder={t("settingsConnections:settingsDialogJiraConnector.selectARegisteredProject")} />
              </SelectTrigger>
              <SelectContent>
                {repositories.map((repository) => (
                  <SelectItem
                    key={repository.repositoryPath}
                    value={repository.repositoryPath}
                  >
                    {repository.repositoryName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={addMapping}>
              {t("settingsConnections:settingsDialogJiraConnector.addMapping")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
