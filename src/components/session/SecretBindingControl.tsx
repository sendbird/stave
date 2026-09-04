import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
import { ComposerControlLabel } from "@/components/ai-elements/composer-control-density";
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
            className="h-9 gap-1.5 px-2.5 text-xs text-muted-foreground shadow-none hover:text-foreground"
            disabled={disabled}
            aria-label="Bind secrets to this task as environment variables"
            title="Bind secrets to this task"
          />
        }
      >
        <KeyRound className="size-4" />
        <ComposerControlLabel>{label}</ComposerControlLabel>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-80">
        <DropdownMenuLabel className="flex items-center gap-2">
          <KeyRound className="size-3.5" />
          Bind secrets as env vars
        </DropdownMenuLabel>
        {loaded && injectableSecrets.length === 0 ? (
          <p className="px-2 py-3 text-xs leading-5 text-muted-foreground">
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
                  className="items-start gap-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm">{secret.name}</span>
                      <code className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] leading-4 text-muted-foreground">
                        ${secret.envVarName}
                      </code>
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {secret.valuePreview || "••••"}
                    </span>
                  </span>
                </DropdownMenuCheckboxItem>
              );
            })}
            <DropdownMenuSeparator />
            <p className="px-2 py-2 text-[11px] leading-4 text-muted-foreground">
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
