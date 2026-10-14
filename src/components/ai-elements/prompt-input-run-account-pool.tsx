import { useId, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Search } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Checkbox } from "@/components/ads/components/Checkbox";
import { InputGroup } from "@/components/ads/components/InputGroup";
import { Separator } from "@/components/ads/components/Separator";
import { useProviderAccountIdentity } from "@/lib/providers/use-provider-account-identity";
import type { ProviderAccountIdentity } from "@/lib/providers/provider-account-identity";
import type { ProviderAccountProviderId } from "@/lib/providers/provider-accounts";
import { vars } from "../ads/tokens/tokens.stylex";
import { sx } from "../ads/utils/stylex";

export interface PromptInputRunAccountPoolAccount {
  id: string;
  label: string;
  /** The account the Run starts on; always first and always in the pool. */
  current: boolean;
  included: boolean;
}

/**
 * The next Run's account pool: off by default. On, a usage limit continues the
 * Run on the first listed subscription account with usage left. The list is
 * the run's account, then Settings order; API connections are never listed.
 */
export interface PromptInputRunAccountPool {
  providerId: ProviderAccountProviderId;
  enabled: boolean;
  /** A live Run shows its frozen pool, read-only. */
  locked: boolean;
  accounts: PromptInputRunAccountPoolAccount[];
  onEnabledChange: (enabled: boolean) => void;
  onAccountIncludedChange: (accountId: string, included: boolean) => void;
}

/** From this many accounts the list shows a search field. */
export const RUN_ACCOUNT_POOL_SEARCH_MIN_ACCOUNTS = 6;

/** The accounts whose name or id contains the query, ignoring case; all for an empty query. */
export function filterRunAccountPoolAccounts<T extends Pick<PromptInputRunAccountPoolAccount, "id" | "label">>(
  accounts: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...accounts];
  return accounts.filter((account) =>
    account.label.toLocaleLowerCase().includes(needle) || account.id.toLocaleLowerCase().includes(needle));
}

/**
 * Whether the draft list offers an account. Only a confirmed sign-in joins the
 * pool, so an account whose check says signed out or failed is not offered;
 * one still being checked shows until its answer arrives. The run's own
 * account and a live Run's frozen pool always show.
 */
export function offersRunPoolAccount(args: { locked: boolean; current: boolean; identity: ProviderAccountIdentity | undefined }) {
  return args.locked || args.current || !args.identity || args.identity.state === "signed-in";
}

function PoolAccountRow({ pool, account }: { pool: PromptInputRunAccountPool; account: PromptInputRunAccountPoolAccount }) {
  const { t } = useTranslation("agentRuns");
  // Row-local: only this row re-renders when its sign-in check answers.
  const identity = useProviderAccountIdentity(pool.providerId, account.id, !pool.locked);
  if (!offersRunPoolAccount({ locked: pool.locked, current: account.current, identity })) return null;
  return (
    <Checkbox
      checked={account.included}
      disabled={pool.locked || account.current}
      label={account.label}
      description={account.current ? t("accountPool.current") : undefined}
      onCheckedChange={(checked) => pool.onAccountIncludedChange(account.id, checked === true)}
    />
  );
}

/** The pool's accounts: a search field once the list is long, then a capped, scrolling list. */
export function PromptInputRunAccountPoolAccounts({ pool, query, onQueryChange }: {
  pool: PromptInputRunAccountPool;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const { t } = useTranslation("agentRuns");
  const searchable = pool.accounts.length >= RUN_ACCOUNT_POOL_SEARCH_MIN_ACCOUNTS;
  const visible = searchable ? filterRunAccountPoolAccounts(pool.accounts, query) : pool.accounts;
  return (
    <fieldset className={sx(styles.accounts)}>
      <legend className={sx(styles.legend)}>{t("accountPool.accountsLabel")}</legend>
      {searchable ? (
        <InputGroup
          size="sm"
          leading={<Search aria-hidden />}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label={t("accountPool.searchLabel")}
          placeholder={t("accountPool.searchPlaceholder")}
          autoComplete="off"
          spellCheck={false}
          data-testid="run-account-pool-search"
        />
      ) : null}
      <div className={sx(styles.list)} data-testid="run-account-pool-list">
        {visible.map((account) => <PoolAccountRow key={account.id} pool={pool} account={account} />)}
        {visible.length === 0 ? (
          <p role="status" className={sx(styles.notice)}>{t("accountPool.noMatches", { query: query.trim() })}</p>
        ) : null}
      </div>
    </fieldset>
  );
}

export function PromptInputRunAccountPoolSection({ pool }: { pool: PromptInputRunAccountPool }) {
  const { t } = useTranslation("agentRuns");
  const headingId = useId();
  const [query, setQuery] = useState("");
  return (
    <section aria-labelledby={headingId} data-testid="run-account-pool" className={sx(styles.section)}>
      <Separator />
      <p id={headingId} className={sx(styles.heading)}>{t("accountPool.title")}</p>
      <Checkbox
        checked={pool.enabled}
        disabled={pool.locked}
        label={t("accountPool.enable")}
        description={t("accountPool.description")}
        onCheckedChange={(checked) => pool.onEnabledChange(checked === true)}
      />
      {pool.enabled && pool.accounts.length ? (
        <PromptInputRunAccountPoolAccounts pool={pool} query={query} onQueryChange={setQuery} />
      ) : null}
      <p className={sx(styles.notice)}>{t("accountPool.notice")}</p>
    </section>
  );
}

const styles = stylex.create({
  section: { display: "flex", flexDirection: "column", gap: vars["--ads-space-12"] },
  heading: {
    margin: 0,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-semibold"],
    color: vars["--ads-color-text"],
  },
  accounts: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    margin: 0,
    padding: 0,
    borderWidth: 0,
    minWidth: 0,
  },
  legend: {
    padding: 0,
    marginBottom: vars["--ads-space-8"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
  // The list scrolls inside the popover instead of growing it. The inline
  // padding keeps the checkboxes' focus ring inside the scroll box; the
  // matching negative margin keeps the rows aligned with the content above.
  list: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-8"],
    maxBlockSize: "min(240px, 40dvh)",
    overflowX: "hidden",
    overflowY: "auto",
    overscrollBehavior: "contain",
    minInlineSize: 0,
    padding: vars["--ads-space-4"],
    marginInline: `calc(-1 * ${vars["--ads-space-4"]})`,
  },
  notice: {
    margin: 0,
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
});
