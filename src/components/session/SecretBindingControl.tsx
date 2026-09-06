import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
import {
  COMPOSER_CONTROL_BUTTON,
  ComposerControlLabel,
  composerControlAttributes,
} from "@/components/ai-elements/composer-control-density";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { MAX_BOUND_SECRETS, type SecretMetadata } from "@/lib/secrets/secrets";
import { sx } from "@/components/ads/utils/stylex";
import { secretBindingControlStyles as styles } from "./secret-binding-control.styles";

interface SecretBindingControlProps {
  /** Ids of secrets currently bound to the task draft. */
  boundSecretIds: readonly string[] | undefined;
  /** Persist the next bound-id set on the prompt draft. */
  onChange: (nextBoundSecretIds: string[]) => void;
  disabled?: boolean;
}

/**
 * Composer control that lets the user bind vault secrets to the current task so
 * its provider runtime receives them as environment variables.
 *
 * Only secrets that define an `envVarName` are injectable and therefore listed.
 * The control never reveals a value — it shows the masked preview and the env
 * variable name only, mirroring the Settings > Secrets surface.
 */
export function SecretBindingControl({
  boundSecretIds,
  onChange,
  disabled,
}: SecretBindingControlProps) {
  const [secrets, setSecrets] = useState<SecretMetadata[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadSecrets = useCallback(async () => {
    const list = window.api?.secrets?.list;
    if (!list) {
      setLoaded(true);
      return;
    }
    try {
      const result = await list();
      if (result.ok) {
        setSecrets(result.secrets);
      }
    } catch {
      // Secret listing is best-effort here; the Settings surface reports errors.
    } finally {
      setLoaded(true);
    }
  }, []);

  // Refresh whenever the menu opens so a secret added in Settings appears
  // without needing a reload.
  useEffect(() => {
    if (open) {
      void loadSecrets();
    }
  }, [open, loadSecrets]);

  const injectableSecrets = useMemo(
    () => secrets.filter((secret) => Boolean(secret.envVarName)),
    [secrets],
  );

  const boundIdSet = useMemo(
    () => new Set(boundSecretIds ?? []),
    [boundSecretIds],
  );

  // Count only bindings that still resolve to a listed, injectable secret so a
  // stale id (deleted secret) does not inflate the badge.
  const activeBoundCount = useMemo(() => {
    if (!loaded) {
      return boundIdSet.size;
    }
    return injectableSecrets.filter((secret) => boundIdSet.has(secret.id))
      .length;
  }, [loaded, injectableSecrets, boundIdSet]);

  const toggleSecret = useCallback(
    (secretId: string, nextChecked: boolean) => {
      const current = (boundSecretIds ?? []).filter((id) =>
        injectableSecrets.some((secret) => secret.id === id),
      );
      if (nextChecked) {
        if (current.includes(secretId)) {
          return;
        }
        if (current.length >= MAX_BOUND_SECRETS) {
          return;
        }
        onChange([...current, secretId]);
        return;
      }
      onChange(current.filter((id) => id !== secretId));
    },
    [boundSecretIds, injectableSecrets, onChange],
  );

  const label =
    activeBoundCount > 0 ? `Secrets · ${activeBoundCount}` : "Secrets";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={COMPOSER_CONTROL_BUTTON}
            {...composerControlAttributes}
            data-secret-binding-control="true"
            disabled={disabled}
            aria-label="Bind secrets to this task as environment variables"
            title="Bind secrets to this task"
          />
        }
      >
        <KeyRound />
        <ComposerControlLabel>{label}</ComposerControlLabel>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className={sx(styles.content)}
      >
        <DropdownMenuLabel className={sx(styles.label)}>
          <KeyRound className={sx(styles.labelIcon)} />
          Bind secrets as env vars
        </DropdownMenuLabel>
        {loaded && injectableSecrets.length === 0 ? (
          <p className={sx(styles.empty)}>
            No secrets define an environment variable name yet. Add one in
            Settings → Secrets to make it injectable.
          </p>
        ) : (
          <>
            {injectableSecrets.map((secret) => {
              const checked = boundIdSet.has(secret.id);
              const atCap = !checked && activeBoundCount >= MAX_BOUND_SECRETS;
              return (
                <DropdownMenuCheckboxItem
                  key={secret.id}
                  checked={checked}
                  disabled={atCap}
                  // Checkbox items keep the menu open by default (closeOnClick
                  // defaults to false), which is what multi-select wants.
                  onCheckedChange={(next) => toggleSecret(secret.id, next)}
                  className={sx(styles.item)}
                >
                  <span className={sx(styles.itemBody)}>
                    <span className={sx(styles.itemTitleRow)}>
                      <span className={sx(styles.itemTitle)}>{secret.name}</span>
                      <code className={sx(styles.itemEnvVar)}>
                        ${secret.envVarName}
                      </code>
                    </span>
                    <span className={sx(styles.itemPreview)}>
                      {secret.valuePreview || "••••"}
                    </span>
                  </span>
                </DropdownMenuCheckboxItem>
              );
            })}
            <DropdownMenuSeparator />
            <p className={sx(styles.footnote)}>
              Bound values are available to shell commands and supported MCP
              authentication for this task. They are never shown to the agent,
              but a command that echoes the variable can still surface it.
            </p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
