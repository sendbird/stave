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
        toast.error("Failed to load saved Lens accounts", {
          description: result.message,
        });
        return;
      }
      setCredentials(result.credentials);
    } catch (error) {
      toast.error("Failed to load saved Lens accounts", {
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
        "Enter at least one valid hostname or http(s) URL. Add a row for each host.",
      );
      return;
    }
    if (!username.trim()) {
      toast.error("Enter a username or email address.");
      return;
    }
    if (!editingId && !password) {
      toast.error("Enter a password for the new account.");
      return;
    }

    const upsertCredential = window.api?.lens?.upsertCredential;
    if (!upsertCredential) {
      toast.error(
        "Secure Lens account storage is available in the desktop app.",
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
        toast.error("Failed to save Lens account", {
          description: result.message,
        });
        return;
      }
      toast.success(editingId ? "Lens account updated" : "Lens account saved");
      closeEditor();
      await loadCredentials();
    } catch (error) {
      toast.error("Failed to save Lens account", {
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
      toast.error("Secure Lens account storage is unavailable.");
      return;
    }
    setSaving(true);
    try {
      const result = await removeCredential({ id: deletingId });
      if (!result.ok) {
        toast.error("Failed to delete Lens account", {
          description: result.message,
        });
        return;
      }
      toast.success("Lens account deleted");
      setDeletingId(null);
      if (editingId === deletingId) {
        closeEditor();
      }
      await loadCredentials();
    } catch (error) {
      toast.error("Failed to delete Lens account", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }, [closeEditor, deletingId, editingId, loadCredentials]);

  return (
    <>
      <SettingsCard
        title="Saved Accounts"
        description="Store multiple accounts, each covering one or more exact hostnames. Usernames and passwords are encrypted by the operating system and stay out of Stave settings, chat, and MCP responses."
        titleAccessory={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={sx(styles.addButton)}
            onClick={openNewEditor}
          >
            <Plus className={sx(styles.addIcon)} />
            Add account
          </Button>
        }
      >
        <div className={sx(styles.notice)}>
          <ShieldCheck className={sx(styles.noticeIcon)} />
          <p className={sx(styles.noticeText)}>
            Lens fills matching login fields directly in Electron. Automatic
            fill never submits the form; an agent may submit only through a
            separate Lens tool call.
          </p>
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
                <span>Hosts</span>
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
                        aria-label={`Saved account host ${index + 1}`}
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
                        aria-label={`Remove host ${index + 1}`}
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
                  Add host
                </Button>
                <span className={sx(styles.hostHelp)}>
                  Add one exact hostname per row.
                </span>
              </div>
              <label className={sx(styles.fieldLabel)}>
                Username or email
                <Input
                  value={username}
                  placeholder="name@example.com"
                  aria-label="Saved account username"
                  autoComplete="username"
                  className={sx(styles.stacked, styles.fieldControl)}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
            </div>
            <label className={sx(styles.fieldLabel)}>
              Password
              <Input
                type="password"
                value={password}
                placeholder={
                  editingCredential
                    ? "Leave blank to keep the saved password"
                    : "Required"
                }
                aria-label="Saved account password"
                autoComplete="new-password"
                className={sx(styles.stacked, styles.fieldControl)}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className={sx(styles.autoFillRow)}>
              <div>
                <p className={sx(styles.autoFillTitle)}>Fill automatically</p>
                <p className={sx(styles.autoFillDescription)}>
                  Use this account after Lens loads any of its hosts. Enabling
                  it turns automatic fill off for other accounts that share a
                  host with this one. The form is not submitted automatically.
                </p>
              </div>
              <Switch
                checked={autoFill}
                onCheckedChange={setAutoFill}
                aria-label="Fill saved Lens account automatically"
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
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? (
                  <Loader aria-hidden size="xs" variant="persist" />
                ) : null}
                {editingId ? "Update account" : "Save account"}
              </Button>
            </div>
          </form>
        ) : null}

        {loading ? (
          <div className={sx(styles.loadingRow)}>
            <Loader aria-hidden size="xs" variant="persist" />
            Loading saved accounts…
          </div>
        ) : credentials.length === 0 ? (
          <p className={sx(styles.emptyText)}>No accounts are saved yet.</p>
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
                      {credential.autoFill ? "Auto-fill" : "On demand"}
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
                  aria-label={`Edit ${credential.username} for ${credential.hosts.join(", ")}`}
                  onClick={() => openEditEditor(credential)}
                >
                  <Pencil className={sx(styles.actionIcon)} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Delete ${credential.username} for ${credential.hosts.join(", ")}`}
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
        title="Delete saved Lens account?"
        description="The encrypted password and account metadata will be removed from this Stave installation."
        confirmLabel="Delete account"
        loading={saving}
        onConfirm={() => {
          void deleteCredential();
        }}
        onCancel={() => setDeletingId(null)}
      />
    </>
  );
}
