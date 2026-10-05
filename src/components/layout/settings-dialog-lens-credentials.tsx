import { i18n, I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Badge, Button, Input, Loader, Switch, toast } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { ConfirmDialog } from "./ConfirmDialog";
import { SettingsCard } from "./settings-dialog.shared";
import { lensCredentialsStyles as styles } from "./settings-dialog-lens-credentials.styles";
import {
  normalizeLensCredentialHosts,
  type LensCredentialMetadata,
} from "@/lib/lens/lens-credentials";

/** A single empty editable host row so the editor always shows one field. */
const EMPTY_HOST_ROWS = [""];

/** Split a saved host list into editable rows, keeping at least one row. */
function hostsToRows(hosts: string[]): string[] {
  return hosts.length > 0 ? [...hosts] : [...EMPTY_HOST_ROWS];
}

export function LensCredentialsSettingsCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [credentials, setCredentials] = useState<LensCredentialMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hostRows, setHostRows] = useState<string[]>([...EMPTY_HOST_ROWS]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [autoFill, setAutoFill] = useState(true);

  const editingCredential = useMemo(
    () => credentials.find((entry) => entry.id === editingId) ?? null,
    [credentials, editingId],
  );

  const loadCredentials = useCallback(async () => {
    const listCredentials = window.api?.lens?.listCredentials;
    if (!listCredentials) {
      setLoading(false);
      return;
    }
    try {
      const result = await listCredentials();
      if (!result.ok) {
        toast.error(i18n.t("settingsConnections:settingsDialogLensCredentials.failedToLoadSavedLensAccounts"), {
          description: result.message,
        });
        return;
      }
      setCredentials(result.credentials);
    } catch (error) {
      toast.error(i18n.t("settingsConnections:settingsDialogLensCredentials.failedToLoadSavedLensAccounts"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingId(null);
    setHostRows([...EMPTY_HOST_ROWS]);
    setUsername("");
    setPassword("");
    setAutoFill(true);
  }, []);

  const openNewEditor = useCallback(() => {
    closeEditor();
    setEditorOpen(true);
  }, [closeEditor]);

  const openEditEditor = useCallback((credential: LensCredentialMetadata) => {
    setEditingId(credential.id);
    setHostRows(hostsToRows(credential.hosts));
    setUsername(credential.username);
    setPassword("");
    setAutoFill(credential.autoFill);
    setEditorOpen(true);
  }, []);

  const updateHostRow = useCallback((index: number, value: string) => {
    setHostRows((rows) => rows.map((row, i) => (i === index ? value : row)));
  }, []);

  const addHostRow = useCallback(() => {
    setHostRows((rows) => [...rows, ""]);
  }, []);

  const removeHostRow = useCallback((index: number) => {
    setHostRows((rows) => {
      if (rows.length <= 1) {
        return [""];
      }
      return rows.filter((_, i) => i !== index);
    });
  }, []);

  const saveCredential = useCallback(async () => {
    const normalizedHosts = normalizeLensCredentialHosts(hostRows);
    if (!normalizedHosts) {
      toast.error(
        i18n.t("settingsConnections:settingsDialogLensCredentials.enterAtLeastOneValidHostname"),
      );
      return;
    }
    if (!username.trim()) {
      toast.error(i18n.t("settingsConnections:settingsDialogLensCredentials.enterAUsernameOrEmailAddress"));
      return;
    }
    if (!editingId && !password) {
      toast.error(i18n.t("settingsConnections:settingsDialogLensCredentials.enterAPasswordForTheNew"));
      return;
    }

    const upsertCredential = window.api?.lens?.upsertCredential;
    if (!upsertCredential) {
      toast.error(
        i18n.t("settingsConnections:settingsDialogLensCredentials.secureLensAccountStorageIsAvailable"),
      );
      return;
    }

    setSaving(true);
    try {
      const result = await upsertCredential({
        ...(editingId ? { id: editingId } : {}),
        hosts: normalizedHosts,
        username: username.trim(),
        ...(password ? { password } : {}),
        autoFill,
      });
      if (!result.ok) {
        toast.error(i18n.t("settingsConnections:settingsDialogLensCredentials.failedToSaveLensAccount"), {
          description: result.message,
        });
        return;
      }
      toast.success(editingId ? i18n.t("settingsConnections:settingsDialogLensCredentials.lensAccountUpdated") : i18n.t("settingsConnections:settingsDialogLensCredentials.lensAccountSaved"));
      closeEditor();
      await loadCredentials();
    } catch (error) {
      toast.error(i18n.t("settingsConnections:settingsDialogLensCredentials.failedToSaveLensAccount"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }, [
    autoFill,
    closeEditor,
    editingId,
    hostRows,
    loadCredentials,
    password,
    username,
  ]);

  const deleteCredential = useCallback(async () => {
    if (!deletingId) {
      return;
    }
    const removeCredential = window.api?.lens?.deleteCredential;
    if (!removeCredential) {
      toast.error(i18n.t("settingsConnections:settingsDialogLensCredentials.secureLensAccountStorageIsUnavailable"));
      return;
    }
    setSaving(true);
    try {
      const result = await removeCredential({ id: deletingId });
      if (!result.ok) {
        toast.error(i18n.t("settingsConnections:settingsDialogLensCredentials.failedToDeleteLensAccount"), {
          description: result.message,
        });
        return;
      }
      toast.success(i18n.t("settingsConnections:settingsDialogLensCredentials.lensAccountDeleted"));
      setDeletingId(null);
      if (editingId === deletingId) {
        closeEditor();
      }
      await loadCredentials();
    } catch (error) {
      toast.error(i18n.t("settingsConnections:settingsDialogLensCredentials.failedToDeleteLensAccount"), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }, [closeEditor, deletingId, editingId, loadCredentials]);

  return (
    <>
      <SettingsCard
        title={t("settingsConnections:settingsDialogLensCredentials.savedAccounts")}
        description={t("settingsConnections:settingsDialogLensCredentials.storeMultipleAccountsEachCoveringOne")}
        titleAccessory={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={sx(styles.addButton)}
            onClick={openNewEditor}
          >
            <Plus className={sx(styles.addIcon)} />
            {t("settingsConnections:providerAccountAddForm.addAccount")}</Button>
        }
      >
        <div className={sx(styles.notice)}>
          <ShieldCheck className={sx(styles.noticeIcon)} />
          <p className={sx(styles.noticeText)}>
            {t("settingsConnections:settingsDialogLensCredentials.lensFillsMatchingLoginFieldsDirectly")}</p>
        </div>

        {editorOpen ? (
          <form
            className={sx(styles.form)}
            onSubmit={(event) => {
              event.preventDefault();
              void saveCredential();
            }}
          >
            <div className={sx(styles.grid)}>
              <div className={sx(styles.hostsField)}>
                <span>{t("settingsConnections:settingsDialogLensCredentials.hosts")}</span>
                <div className={sx(styles.hostRows)}>
                  {hostRows.map((host, index) => (
                    <div key={index} className={sx(styles.hostRow)}>
                      <Input
                        value={host}
                        placeholder={
                          index === 0
                            ? "dashboard-dev.sendbird.com"
                            : "another-host.example.com"
                        }
                        aria-label={i18n.t("settingsConnections:settingsDialogLensCredentials.savedAccountHost", { value1: index + 1 })}
                        autoComplete="url"
                        className={sx(styles.hostInput)}
                        onChange={(event) =>
                          updateHostRow(index, event.target.value)
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className={sx(styles.removeHost)}
                        aria-label={i18n.t("settingsConnections:settingsDialogLensCredentials.removeHost", { value1: index + 1 })}
                        disabled={hostRows.length <= 1 && host.length === 0}
                        onClick={() => removeHostRow(index)}
                      >
                        <X className={sx(styles.removeHostIcon)} />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={sx(styles.addHostButton)}
                  onClick={addHostRow}
                >
                  <Plus className={sx(styles.addHostIcon)} />
                  {t("settings:lensSection.developerMode.addHost")}</Button>
                <span className={sx(styles.hostHelp)}>
                  {t("settingsConnections:settingsDialogLensCredentials.addOneExactHostnamePerRow")}</span>
              </div>
              <label className={sx(styles.fieldLabel)}>
                {t("settingsConnections:settingsDialogLensCredentials.usernameOrEmail")}<Input
                  value={username}
                  placeholder="name@example.com"
                  aria-label={t("settingsConnections:settingsDialogLensCredentials.savedAccountUsername")}
                  autoComplete="username"
                  className={sx(styles.stacked, styles.fieldControl)}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
            </div>
            <label className={sx(styles.fieldLabel)}>
              {t("settingsConnections:settingsDialogLensCredentials.password")}<Input
                type="password"
                value={password}
                placeholder={
                  editingCredential
                    ? t("settingsConnections:settingsDialogLensCredentials.leaveBlankToKeepTheSaved")
                    : t("common:labels.required")
                }
                aria-label={t("settingsConnections:settingsDialogLensCredentials.savedAccountPassword")}
                autoComplete="new-password"
                className={sx(styles.stacked, styles.fieldControl)}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className={sx(styles.autoFillRow)}>
              <div>
                <p className={sx(styles.autoFillTitle)}>{t("settingsConnections:settingsDialogLensCredentials.fillAutomatically")}</p>
                <p className={sx(styles.autoFillDescription)}>
                  {t("settingsConnections:settingsDialogLensCredentials.useThisAccountAfterLensLoads")}</p>
              </div>
              <Switch
                checked={autoFill}
                onCheckedChange={setAutoFill}
                aria-label={t("settingsConnections:settingsDialogLensCredentials.fillSavedLensAccountAutomatically")}
              />
            </div>
            <div className={sx(styles.formActions)}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={closeEditor}
              >
                {t("common:actions.cancel")}</Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? (
                  <Loader aria-hidden size="xs" variant="persist" />
                ) : null}
                {editingId ? t("settingsConnections:settingsDialogLensCredentials.updateAccount") : t("settingsConnections:settingsDialogLensCredentials.saveAccount")}
              </Button>
            </div>
          </form>
        ) : null}

        {loading ? (
          <div className={sx(styles.loadingRow)}>
            <Loader aria-hidden size="xs" variant="persist" />
            {t("settingsConnections:settingsDialogLensCredentials.loadingSavedAccounts")}</div>
        ) : credentials.length === 0 ? (
          <p className={sx(styles.emptyText)}>{t("settingsConnections:settingsDialogLensCredentials.noAccountsAreSavedYet")}</p>
        ) : (
          <div className={sx(styles.list)}>
            {credentials.map((credential) => (
              <div key={credential.id} className={sx(styles.row)}>
                <div className={sx(styles.rowMark)}>
                  <KeyRound className={sx(styles.rowMarkIcon)} />
                </div>
                <div className={sx(styles.rowBody)}>
                  <div className={sx(styles.rowHostLine)}>
                    {credential.hosts.map((host) => (
                      <span key={host} className={sx(styles.rowHost)}>
                        {host}
                      </span>
                    ))}
                    <Badge variant="secondary" className={sx(styles.badge)}>
                      {credential.autoFill ? i18n.t("settingsConnections:settingsDialogLensCredentials.autoFill") : i18n.t("settingsConnections:settingsDialogLensCredentials.onDemand")}
                    </Badge>
                  </div>
                  <p className={sx(styles.rowUsername)}>
                    {credential.username}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={i18n.t("settingsConnections:settingsDialogLensCredentials.editFor", { value1: credential.username, value2: credential.hosts.join(", ") })}
                  onClick={() => openEditEditor(credential)}
                >
                  <Pencil className={sx(styles.actionIcon)} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={i18n.t("settingsConnections:settingsDialogLensCredentials.deleteFor", { value1: credential.username, value2: credential.hosts.join(", ") })}
                  onClick={() => setDeletingId(credential.id)}
                >
                  <Trash2 className={sx(styles.actionIcon)} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      <ConfirmDialog
        open={deletingId !== null}
        title={t("settingsConnections:settingsDialogLensCredentials.deleteSavedLensAccount")}
        description={t("settingsConnections:settingsDialogLensCredentials.theEncryptedPasswordAndAccountMetadata")}
        confirmLabel={t("settingsConnections:settingsDialogLensCredentials.deleteAccount")}
        loading={saving}
        onConfirm={() => {
          void deleteCredential();
        }}
        onCancel={() => setDeletingId(null)}
      />
    </>
  );
}
