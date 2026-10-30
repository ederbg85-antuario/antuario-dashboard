import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { loadClientAccount } from "@/lib/client-accounts-access";
import { getDemoAccount } from "@/lib/client-accounts-fixtures";
import { prepareAccountPresentation } from "@/lib/client-account-presentation";
import {
  mexicoAccountDate,
  resolveAccountsRange,
} from "@/lib/client-accounts-metrics";
import {
  defaultAccountRange,
  latestMarketingRange,
} from "@/lib/client-account-reporting";
import AccountsClient from "@/components/accounts/AccountsClient";
export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ demo?: string; ejemplo?: string; tab?: string }>;
}) {
  const [context, { id }, query] = await Promise.all([
      requireWorkspace(),
      params,
      searchParams,
    ]),
    example = query.demo === "1" || query.ejemplo === "1";
  const bundle = example
    ? getDemoAccount(id)
    : await loadClientAccount(context, id);
  if (!bundle) notFound();
  return (
    <AccountsClient
      key={`${id}:${example}`}
      accountId={id}
      example={example}
      initialTab={query.tab}
      initialPresentation={prepareAccountPresentation(
        bundle,
        query.tab === "canales" && id === "a69fe8b1-14f5-4033-9cda-dc55d9e2726d"
          ? (latestMarketingRange(bundle, "search_console") ??
              defaultAccountRange(bundle))
          : ["cobranza", "operacion", "entregables"].includes(query.tab ?? "")
            ? resolveAccountsRange(
                "month",
                mexicoAccountDate(new Date(bundle.server_time)),
              )
            : defaultAccountRange(bundle),
      )}
    />
  );
}
