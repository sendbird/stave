import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button, Input, Loader, Textarea, toast } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { ConfirmDialog } from "./ConfirmDialog";
import { SettingsCard } from "./settings-dialog.shared";
import { secretsStyles as styles } from "./settings-dialog-secrets.styles";
import type { SecretMetadata } from "@/lib/secrets/secrets";

export function SecretsSettingsCard() {
  const [secrets, setSecrets] = useState<SecretMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [envVarName, setEnvVarName] = useState("");
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [revealedValue, setRevealedValue] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const editingSecret = useMemo(
    () => secrets.find((entry) => entry.id === editingId) ?? null,
    [secrets, editingId],
  );

  const loadSecrets = useCallback(async () => {
    const list = window.api?.secrets?.list;
    if (!list) {
      setLoading(false);
      return;
    }
    try {
      const result = await list();
      if (!result.ok) {
        toast.error("Failed to load secrets", { description: result.message });
        return;
      }
      setSecrets(result.secrets);
    } catch (error) {
      toast.error("Failed to load secrets", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSecrets();
  }, [loadSecrets]);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingId(null);
    setName("");
    setDescription("");
    setEnvVarName("");
    setValue("");
    setShowValue(false);
  }, []);

  const openNewEditor = useCallback(() => {
    closeEditor();
    setEditorOpen(true);
  }, [closeEditor]);

  const openEditEditor = useCallback((secret: SecretMetadata) => {
    setEditingId(secret.id);
    setName(secret.name);
    setDescription(secret.description);
    setEnvVarName(secret.envVarName ?? "");
    setValue("");
    setShowValue(false);
    setEditorOpen(true);
  }, []);

  const saveSecret = useCallback(async () => {
    if (!name.trim()) {
      toast.error("Enter a name for the secret.");
      return;
    }
    if (!editingId && !value) {
      toast.error("Enter a value for the new secret.");
      return;
    }

    const upsert = window.api?.secrets?.upsert;
    if (!upsert) {
      toast.error("Secure secret storage is available in the desktop app.");
      return;
    }

    setSaving(true);
    try {
      const result = await upsert({
        ...(editingId ? { id: editingId } : {}),
        name: name.trim(),
        description: description.trim(),
        envVarName: envVarName.trim(),
        ...(value ? { value } : {}),
      });
      if (!result.ok) {
        toast.error("Failed to save secret", { description: result.message });
        return;
      }
      toast.success(editingId ? "Secret updated" : "Secret saved");
      closeEditor();
      await loadSecrets();
    } catch (error) {
      toast.error("Failed to save secret", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }, [
    closeEditor,
    description,
    editingId,
    envVarName,
    loadSecrets,
    name,
    value,
  ]);

  const deleteSecret = useCallback(async () => {
    if (!deletingId) {
      return;
    }
    const remove = window.api?.secrets?.delete;
    if (!remove) {
      toast.error("Secure secret storage is unavailable.");
      return;
    }
    setSaving(true);
    try {
      const result = await remove({ id: deletingId });
      if (!result.ok) {
        toast.error("Failed to delete secret", { description: result.message });
        return;
      }
      toast.success("Secret deleted");
      if (revealedId === deletingId) {
        setRevealedId(null);
        setRevealedValue("");
      }
      if (editingId === deletingId) {
        closeEditor();
      }
      setDeletingId(null);
      await loadSecrets();
    } catch (error) {
      toast.error("Failed to delete secret", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }, [closeEditor, deletingId, editingId, loadSecrets, revealedId]);

  const toggleReveal = useCallback(
    async (secret: SecretMetadata) => {
      if (revealedId === secret.id) {
        setRevealedId(null);
        setRevealedValue("");
        return;
      }
      const reveal = window.api?.secrets?.reveal;
      if (!reveal) {
        toast.error("Secure secret storage is unavailable.");
        return;
      }
      try {
        const result = await reveal({ id: secret.id });
        if (!result.ok || result.value === undefined) {
          toast.error("Failed to reveal secret", {
            description: result.message,
          });
          return;
        }
        setRevealedId(secret.id);
        setRevealedValue(result.value);
      } catch (error) {
        toast.error("Failed to reveal secret", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [revealedId],
  );

  const copySecret = useCallback(async (secret: SecretMetadata) => {
    const reveal = window.api?.secrets?.reveal;
    if (!reveal) {
      toast.error("Secure secret storage is unavailable.");
      return;
    }
    try {
      const result = await reveal({ id: secret.id });
      if (!result.ok || result.value === undefined) {
        toast.error("Failed to copy secret", { description: result.message });
        return;
      }
      await navigator.clipboard.writeText(result.value);
      setCopiedId(secret.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === secret.id ? null : current));
      }, 1500);
    } catch (error) {
      toast.error("Failed to copy secret", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  return (
    <>
      <SettingsCard
        title="Secrets"
        description="Store API tokens and other secret values. Values are encrypted by the operating system and stay out of Stave settings, chat, and MCP responses. They are revealed only when you explicitly ask, or injected into a bound task's provider runtime as an environment variable."
        titleAccessory={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={sx(styles.addButton)}
            onClick={openNewEditor}
          >
            <Plus className={sx(styles.addIcon)} />
            Add secret
          </Button>
        }
      >
        <div className={sx(styles.notice)}>
          <ShieldCheck className={sx(styles.noticeIcon)} />
          <p className={sx(styles.noticeText)}>
            A secret's value is never shown to an agent. Give a secret an
            environment variable name to bind it to a task from the composer —
            its value is then available to that task's shell and supported MCP
            authentication (e.g. <code>$OPENAI_API_KEY</code>) without entering
            the model's context. A command that echoes the variable can still
            surface it.
          </p>
        </div>

        {editorOpen ? (
          <form
            className={sx(styles.form)}
            onSubmit={(event) => {
              event.preventDefault();
              void saveSecret();
            }}
          >
            <label className={sx(styles.fieldLabel)}>
              Name
              <Input
                value={name}
                placeholder="OpenAI API key"
                aria-label="Secret name"
                className={sx(styles.stacked, styles.fieldControl)}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className={sx(styles.fieldLabel)}>
              Value
              <div className={sx(styles.stacked, styles.valueRow)}>
                <Input
                  type={showValue ? "text" : "password"}
                  value={value}
                  placeholder={
                    editingSecret
                      ? "Leave blank to keep the saved value"
                      : "Required"
                  }
                  aria-label="Secret value"
                  autoComplete="off"
                  className={sx(styles.fieldControlMono)}
                  onChange={(event) => setValue(event.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className={sx(styles.iconAction)}
                  aria-label={showValue ? "Hide value" : "Show value"}
                  onClick={() => setShowValue((current) => !current)}
                >
                  {showValue ? (
                    <EyeOff className={sx(styles.actionIcon)} />
                  ) : (
                    <Eye className={sx(styles.actionIcon)} />
                  )}
                </Button>
              </div>
            </label>
            <label className={sx(styles.fieldLabel)}>
              Environment variable name
              <span className={sx(styles.fieldOptional)}>(optional)</span>
              <Input
                value={envVarName}
                placeholder="OPENAI_API_KEY"
                aria-label="Secret environment variable name"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className={sx(styles.stacked, styles.fieldControlMono)}
                onChange={(event) => setEnvVarName(event.target.value)}
              />
              <span className={sx(styles.stacked, styles.hint)}>
                Set this to let a task inject the value into its runtime as
                <code className={sx(styles.hintCode)}>
                  ${envVarName.trim() || "NAME"}
                </code>
                . Shell commands and supported MCP authentication can read it,
                but the value is never shown to the agent.
              </span>
            </label>
            <label className={sx(styles.fieldLabel)}>
              Description
              <span className={sx(styles.fieldOptional)}>(optional)</span>
              <Textarea
                value={description}
                placeholder="Where this token is used"
                aria-label="Secret description"
                className={sx(styles.stacked, styles.descriptionArea)}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
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
                {editingId ? "Update secret" : "Save secret"}
              </Button>
            </div>
          </form>
        ) : null}

        {loading ? (
          <div className={sx(styles.loadingRow)}>
            <Loader aria-hidden size="xs" variant="persist" />
            Loading secrets…
          </div>
        ) : secrets.length === 0 ? (
          <p className={sx(styles.emptyText)}>No secrets are saved yet.</p>
        ) : (
          <div className={sx(styles.list)}>
            {secrets.map((secret) => {
              const revealed = revealedId === secret.id;
              return (
                <div key={secret.id} className={sx(styles.row)}>
                  <div className={sx(styles.rowMark)}>
                    <Lock className={sx(styles.rowMarkIcon)} />
                  </div>
                  <div className={sx(styles.rowBody)}>
                    <div className={sx(styles.rowTitleLine)}>
                      <p className={sx(styles.rowTitle)}>{secret.name}</p>
                      {secret.envVarName ? (
                        <code
                          className={sx(styles.rowEnvVar)}
                          title={`Injectable as $${secret.envVarName} when bound to a task`}
                        >
                          ${secret.envVarName}
                        </code>
                      ) : null}
                    </div>
                    <p className={sx(styles.rowValue)}>
                      {revealed ? revealedValue : secret.valuePreview || "••••"}
                    </p>
                    {secret.description ? (
                      <p className={sx(styles.rowDescription)}>
                        {secret.description}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={
                      revealed ? `Hide ${secret.name}` : `Reveal ${secret.name}`
                    }
                    onClick={() => void toggleReveal(secret)}
                  >
                    {revealed ? (
                      <EyeOff className={sx(styles.actionIcon)} />
                    ) : (
                      <Eye className={sx(styles.actionIcon)} />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Copy ${secret.name}`}
                    onClick={() => void copySecret(secret)}
                  >
                    {copiedId === secret.id ? (
                      <Check className={sx(styles.copiedIcon)} />
                    ) : (
                      <Copy className={sx(styles.actionIcon)} />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Edit ${secret.name}`}
                    onClick={() => openEditEditor(secret)}
                  >
                    <Pencil className={sx(styles.actionIcon)} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Delete ${secret.name}`}
                    onClick={() => setDeletingId(secret.id)}
                  >
                    <Trash2 className={sx(styles.actionIcon)} />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </SettingsCard>

      <ConfirmDialog
        open={deletingId !== null}
        title="Delete saved secret?"
        description="The encrypted value and its metadata will be removed from this Stave installation."
        confirmLabel="Delete secret"
        loading={saving}
        onConfirm={() => {
          void deleteSecret();
        }}
        onCancel={() => setDeletingId(null)}
      />
    </>
  );
}
