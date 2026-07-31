import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button, Input, Textarea, toast } from "@/components/ui";
import { ConfirmDialog } from "./ConfirmDialog";
import { SettingsCard } from "./settings-dialog.shared";
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
  }, [closeEditor, description, editingId, envVarName, loadSecrets, name, value]);

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
            className="gap-1.5"
            onClick={openNewEditor}
          >
            <Plus className="size-3.5" />
            Add secret
          </Button>
        }
      >
        <div className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/20 p-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
          <p className="text-xs leading-5 text-muted-foreground">
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
            className="space-y-3 rounded-md border border-border/80 bg-background/60 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveSecret();
            }}
          >
            <label className="block space-y-1.5 text-xs font-medium">
              Name
              <Input
                value={name}
                placeholder="OpenAI API key"
                aria-label="Secret name"
                className="h-8 text-xs"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              Value
              <div className="flex items-center gap-1.5">
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
                  className="h-8 font-mono text-xs"
                  onChange={(event) => setValue(event.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  aria-label={showValue ? "Hide value" : "Show value"}
                  onClick={() => setShowValue((current) => !current)}
                >
                  {showValue ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </Button>
              </div>
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              Environment variable name
              <span className="ml-1 font-normal text-muted-foreground">
                (optional)
              </span>
              <Input
                value={envVarName}
                placeholder="OPENAI_API_KEY"
                aria-label="Secret environment variable name"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-8 font-mono text-xs"
                onChange={(event) => setEnvVarName(event.target.value)}
              />
              <span className="block font-normal leading-4 text-muted-foreground">
                Set this to let a task inject the value into its runtime as
                <code className="mx-1 rounded bg-muted px-1 py-0.5">
                  ${envVarName.trim() || "NAME"}
                </code>
                . Shell commands and supported MCP authentication can read it,
                but the value is never shown to the agent.
              </span>
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              Description
              <span className="ml-1 font-normal text-muted-foreground">
                (optional)
              </span>
              <Textarea
                value={description}
                placeholder="Where this token is used"
                aria-label="Secret description"
                className="min-h-16 text-xs"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
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
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {editingId ? "Update secret" : "Save secret"}
              </Button>
            </div>
          </form>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading secrets…
          </div>
        ) : secrets.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No secrets are saved yet.
          </p>
        ) : (
          <div className="divide-y divide-border/70 rounded-md border border-border/70">
            {secrets.map((secret) => {
              const revealed = revealedId === secret.id;
              return (
                <div key={secret.id} className="flex items-center gap-3 p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60">
                    <Lock className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-xs font-medium">
                        {secret.name}
                      </p>
                      {secret.envVarName ? (
                        <code
                          className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] leading-4 text-muted-foreground"
                          title={`Injectable as $${secret.envVarName} when bound to a task`}
                        >
                          ${secret.envVarName}
                        </code>
                      ) : null}
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {revealed
                        ? revealedValue
                        : secret.valuePreview || "••••"}
                    </p>
                    {secret.description ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {secret.description}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={
                      revealed
                        ? `Hide ${secret.name}`
                        : `Reveal ${secret.name}`
                    }
                    onClick={() => void toggleReveal(secret)}
                  >
                    {revealed ? (
                      <EyeOff className="size-3.5" />
                    ) : (
                      <Eye className="size-3.5" />
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
                      <Check className="size-3.5 text-success" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Edit ${secret.name}`}
                    onClick={() => openEditEditor(secret)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Delete ${secret.name}`}
                    onClick={() => setDeletingId(secret.id)}
                  >
                    <Trash2 className="size-3.5" />
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
