import { requireWorkspace } from "@/lib/workspace";
import {
  listClientAccounts,
  loadClientAccount,
} from "@/lib/client-accounts-access";
import { getDemoAccounts } from "@/lib/client-accounts-fixtures";
import type {
  AccountBundle,
  AccountsListResponse,
} from "@/lib/client-accounts-types";
import { prepareAccountPresentation } from "@/lib/client-account-presentation";
import { defaultAccountRange } from "@/lib/client-account-reporting";
import AccountsClient from "@/components/accounts/AccountsClient";
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; ejemplo?: string }>;
}) {
  const [context, query] = await Promise.all([
      requireWorkspace(),
      searchParams,
    ]),
    example = query.demo === "1" || query.ejemplo === "1";
  let list: AccountsListResponse, bundles: AccountBundle[];
  if (example) {
    bundles = getDemoAccounts();
    list = {
      accounts: bundles.map((b) => b.account),
      server_time: bundles[0]?.server_time ?? new Date().toISOString(),
      schema_ready: true,
      capabilities: { coordinate: true },
      errors: [],
    };
  } else {
    list = await listClientAccounts(context);
    bundles = (
      await Promise.all(
        list.accounts.map((account) => loadClientAccount(context, account.id)),
      )
    ).filter((bundle): bundle is AccountBundle => bundle !== null);
  }
  return (
    <AccountsClient
      key={`directory:${example}`}
      example={example}
      initialList={list}
      initialPresentations={Object.fromEntries(
        bundles.map((bundle) => [
          bundle.account.id,
          prepareAccountPresentation(bundle, defaultAccountRange(bundle)),
        ]),
      )}
    />
  );
}
