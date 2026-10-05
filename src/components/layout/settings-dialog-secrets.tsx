import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
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
import { SectionStack, SettingsCard } from "./settings-dialog.shared";
import { secretsStyles as styles } from "./settings-dialog-secrets.styles";
import type { SecretMetadata } from "@/lib/secrets/secrets";

export function SecretsSettingsCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
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
        toast.error(i18n.t("settingsConnections:settingsDialogSecrets.failedToLoadSecrets"), { description: result.message });
        return;
      }
      setSecrets(result.secrets);
    } catch (error) {
      toast.error(i18n.t("settingsConnections:settingsDialogSecrets.failedToLoadSecrets"), {
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
      toast.error(i18n.t("settingsConnections:settingsDialogSecrets.enterANameForTheSecret"));
      return;
    }
    if (!editingId && !value) {
      toast.error(i18n.t("settingsConnections:settingsDialogSecrets.enterAValueForTheNew"));
      return;
    }

    const upsert = window.api?.secrets?.upsert;
    if (!upsert) {
      toast.error(i18n.t("settingsConnections:settingsDialogSecrets.secureSecretStorageIsAvailableIn"));
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
        toast.error(i18n.t("settingsConnections:settingsDialogSecrets.failedToSaveSecret"), { description: result.message });
        return;
      }
      toast.success(editingId ? i18n.t("settingsConnections:settingsDialogSecrets.secretUpdated") : i18n.t("settingsConnections:settingsDialogSecrets.secretSaved"));
      closeEditor();
      await loadSecrets();
    } catch (error) {
      toast.error(i18n.t("settingsConnections:settingsDialogSecrets.failedToSaveSecret"), {
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
      toast.error(i18n.t("settingsConnections:settingsDialogSecrets.secureSecretStorageIsUnavailable"));
      return;
    }
    setSaving(true);
    try {
      const result = await remove({ id: deletingId });
      if (!result.ok) {
        toast.error(i18n.t("settingsConnections:settingsDialogSecrets.failedToDeleteSecret"), { description: result.message });
        return;
      }
      toast.success(i18n.t("settingsConnections:settingsDialogSecrets.secretDeleted"));
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
      toast.error(i18n.t("settingsConnections:settingsDialogSecrets.failedToDeleteSecret"), {
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
        toast.error(i18n.t("settingsConnections:settingsDialogSecrets.secureSecretStorageIsUnavailable"));
        return;
      }
      try {
        const result = await reveal({ id: secret.id });
        if (!result.ok || result.value === undefined) {
          toast.error(i18n.t("settingsConnections:settingsDialogSecrets.failedToRevealSecret"), {
            description: result.message,
          });
          return;
        }
        setRevealedId(secret.id);
        setRevealedValue(result.value);
      } catch (error) {
        toast.error(i18n.t("settingsConnections:settingsDialogSecrets.failedToRevealSecret"), {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [revealedId],
  );

  const copySecret = useCallback(async (secret: SecretMetadata) => {
    const reveal = window.api?.secrets?.reveal;
    if (!reveal) {
      toast.error(i18n.t("settingsConnections:settingsDialogSecrets.secureSecretStorageIsUnavailable"));
      return;
    }
    try {
      const result = await reveal({ id: secret.id });
      if (!result.ok || result.value === undefined) {
        toast.error(i18n.t("settingsConnections:settingsDialogSecrets.failedToCopySecret"), { description: result.message });
        return;
      }
      await navigator.clipboard.writeText(result.value);
      setCopiedId(secret.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === secret.id ? null : current));
      }, 1500);
    } catch (error) {
      toast.error(i18n.t("settingsConnections:settingsDialogSecrets.failedToCopySecret"), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  return (
    <>
      <SettingsCard
        title={t("settings:sections.secrets.label")}
        description={t("settingsConnections:settingsDialogSecrets.storeAPITokensAndOtherSecret")}
        titleAccessory={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={sx(styles.addButton)}
            onClick={openNewEditor}
          >
            <Plus className={sx(styles.addIcon)} />
            {t("settingsConnections:settingsDialogSecrets.addSecret")}</Button>
        }
      >
        <div className={sx(styles.notice)}>
          <ShieldCheck className={sx(styles.noticeIcon)} />
          <p className={sx(styles.noticeText)}>
            {t("settingsConnections:settingsDialogSecrets.aSecretSValueIsNever")}<code>{t("settingsConnections:settingsDialogSecrets.openaiAPIKEY")}</code>{t("settingsConnections:settingsDialogSecrets.withoutEnteringTheModelSContext")}</p>
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
              {t("common:labels.name")}<Input
                value={name}
                placeholder={t("settingsConnections:settingsDialogSecrets.openaiAPIKey")}
                aria-label={t("settingsConnections:settingsDialogSecrets.secretName")}
                className={sx(styles.stacked, styles.fieldControl)}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className={sx(styles.fieldLabel)}>
              {t("settingsConnections:settingsDialogSecrets.value")}<div className={sx(styles.stacked, styles.valueRow)}>
                <Input
                  type={showValue ? "text" : "password"}
                  value={value}
                  placeholder={
                    editingSecret
                      ? t("settingsConnections:settingsDialogSecrets.leaveBlankToKeepTheSaved")
                      : t("common:labels.required")
                  }
                  aria-label={t("settingsConnections:settingsDialogSecrets.secretValue")}
                  autoComplete="off"
                  className={sx(styles.fieldControlMono)}
                  onChange={(event) => setValue(event.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className={sx(styles.iconAction)}
                  aria-label={showValue ? t("settingsConnections:settingsDialogSecrets.hideValue") : t("settingsConnections:settingsDialogSecrets.showValue")}
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
              {t("settingsConnections:settingsDialogSecrets.environmentVariableName")}<span className={sx(styles.fieldOptional)}>{t("settingsConnections:settingsDialogSecrets.optional")}</span>
              <Input
                value={envVarName}
                placeholder="OPENAI_API_KEY"
                aria-label={t("settingsConnections:settingsDialogSecrets.secretEnvironmentVariableName")}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className={sx(styles.stacked, styles.fieldControlMono)}
                onChange={(event) => setEnvVarName(event.target.value)}
              />
              <span className={sx(styles.stacked, styles.hint)}>
                {t("settingsConnections:settingsDialogSecrets.setThisToLetATask")}<code className={sx(styles.hintCode)}>
                  ${envVarName.trim() || t("settingsConnections:settingsDialogSecrets.name")}
                </code>
                {t("settingsConnections:settingsDialogSecrets.shellCommandsAndSupportedMCPAuthentication")}</span>
            </label>
            <label className={sx(styles.fieldLabel)}>
              {t("common:labels.description")}<span className={sx(styles.fieldOptional)}>{t("settingsConnections:settingsDialogSecrets.optional")}</span>
              <Textarea
                value={description}
                placeholder={t("settingsConnections:settingsDialogSecrets.whereThisTokenIsUsed")}
                aria-label={t("settingsConnections:settingsDialogSecrets.secretDescription")}
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
                {t("common:actions.cancel")}</Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? (
                  <Loader aria-hidden size="xs" variant="persist" />
                ) : null}
                {editingId ? t("settingsConnections:settingsDialogSecrets.updateSecret") : t("settingsConnections:settingsDialogSecrets.saveSecret")}
              </Button>
            </div>
          </form>
        ) : null}

        {loading ? (
          <div className={sx(styles.loadingRow)}>
            <Loader aria-hidden size="xs" variant="persist" />
            {t("settingsConnections:settingsDialogSecrets.loadingSecrets")}</div>
        ) : secrets.length === 0 ? (
          <p className={sx(styles.emptyText)}>{t("settingsConnections:settingsDialogSecrets.noSecretsAreSavedYet")}</p>
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
                          title={i18n.t("settingsConnections:settingsDialogSecrets.injectableAsWhenBoundToA", { value1: secret.envVarName })}
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
                      revealed ? i18n.t("settingsConnections:settingsDialogSecrets.hide", { value1: secret.name }) : i18n.t("settingsConnections:settingsDialogSecrets.reveal", { value1: secret.name })
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
                    aria-label={i18n.t("settingsConnections:settingsDialogSecrets.copy", { value1: secret.name })}
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
                    aria-label={i18n.t("settings:settingsDialogMacrosSection.edit", { value1: secret.name })}
                    onClick={() => openEditEditor(secret)}
                  >
                    <Pencil className={sx(styles.actionIcon)} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={i18n.t("settings:settingsDialogMacrosSection.delete", { value1: secret.name })}
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
        title={t("settingsConnections:settingsDialogSecrets.deleteSavedSecret")}
        description={t("settingsConnections:settingsDialogSecrets.theEncryptedValueAndItsMetadata")}
        confirmLabel={t("settingsConnections:settingsDialogSecrets.deleteSecret")}
        loading={saving}
        onConfirm={() => {
          void deleteSecret();
        }}
        onCancel={() => setDeletingId(null)}
      />
    </>
  );
}

export function SecretsSection() {
  return (
    <SectionStack>
      <SecretsSettingsCard />
    </SectionStack>
  );
}
