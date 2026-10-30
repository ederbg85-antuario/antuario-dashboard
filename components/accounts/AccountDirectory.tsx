"use client";
import {useFinancialPrivacy} from "@/components/privacy/FinancialPrivacy";
import Link from "next/link";
import Image from "next/image";
import type {
  AccountBundle,
  AccountProfile,
} from "@/lib/client-accounts-types";
import type { AccountPresentation } from "@/lib/client-account-presentation";
import { defaultAccountRange } from "@/lib/client-account-reporting";
import { accountMetrics } from "@/lib/client-accounts-metrics";
import {
  Kpi,
  number,
  shortDate,
  Status,
  Surface,
} from "./AccountPrimitives";

const isAcriland = (account: AccountProfile) =>
  account.id === "a69fe8b1-14f5-4033-9cda-dc55d9e2726d";
const closed = (status: string) =>
  ["done", "completed", "delivered", "cancelled"].includes(status);
const taskCount = (bundle?: AccountBundle) =>
  bundle?.existing_work?.coverage.tasks_read
    ? bundle.existing_work.tasks.filter((task) => !closed(task.status)).length +
      bundle.instances.filter((task) => task.status !== "delivered").length
    : bundle?.instances.length
      ? bundle.instances.filter((task) => task.status !== "delivered").length
      : null;
const manual = (bundle: AccountBundle | undefined, metric: string) =>
  bundle?.snapshots
    .filter((item) => item.source === "manual" && item.metric === metric)
    .sort((a, b) => b.period_to.localeCompare(a.period_to))[0] ?? null;

export function AccountDirectory({
  accounts,
  bundles,
  example,
  archived,
  prepared = {},
}: {
  accounts: AccountProfile[];
  bundles: AccountBundle[];
  example: boolean;
  archived: boolean;
  prepared?: Record<string, AccountPresentation>;
}) {
  const {money,text}=useFinancialPrivacy()
  const rows = accounts.map((account) => {
    const bundle = bundles.find((item) => item.account.id === account.id);
    return {
      account,
      bundle,
      ops: isAcriland(account),
      analysis:
        prepared[account.id]?.analysis ??
        (bundle ? accountMetrics(bundle, defaultAccountRange(bundle)) : null),
      open: taskCount(bundle),
    };
  });
  const open = rows.every((row) => row.open !== null)
    ? rows.reduce((sum, row) => sum + (row.open ?? 0), 0)
    : null;
  const fronts = rows.flatMap(({ account, bundle }) =>
    (bundle?.fronts ?? [])
      .filter((front) => ["attention", "blocked"].includes(front.health))
      .map((front) => ({ account, front })),
  );
  return (
    <>
      <div className="account-kpis">
        <Kpi
          label={archived ? "Cuentas archivadas" : "Cuentas activas"}
          value={number(accounts.length)}
        />
        <Kpi
          label="Trabajo abierto"
          value={number(open)}
          hint="Tareas originales de Producción más entregables del módulo; no cuenta los mensajes de coordinación como nuevas tareas."
        />
        <Kpi label="Frentes por atender" value={number(fronts.length)} />
        <Kpi
          label="Directores asignados"
          value={number(
            accounts.filter((account) => !!account.director_member_id).length,
          )}
        />
      </div>
      <div className="account-overview-row">
        {rows.map(({ account, bundle, analysis, ops, open }) => {
          const negative = manual(bundle, "inventory_negative"),
            pending = manual(bundle, "support_open");
          return (
            <Link
              key={account.id}
              href={`/cuentas/${account.id}${example ? "?demo=1" : ""}`}
              className={`account-surface account-preview-card ${ops ? "is-acriland" : ""}`}
            >
              <header>
                <div className="account-preview-brand">
                  {!account.is_example && (
                    <Image
                      src={
                        ops
                          ? "/accounts/acriland.png"
                          : "/accounts/metrica-btl.png"
                      }
                      alt=""
                      width={42}
                      height={42}
                      unoptimized
                    />
                  )}
                  <div>
                    <h2>{account.name}</h2>
                    <span>
                      {account.director_name ?? "Dirección pendiente"}
                    </span>
                  </div>
                </div>
                <Status value={account.health} />
              </header>
              <p className="account-source">
                {ops
                  ? "Plataforma · taller · inventario · agentes · SEO/IA"
                  : "Captación · SEO · Google Ads · web · reportes"}
              </p>
              <div className="account-card-stats">
                <div>
                  <strong>
                    {number(
                      ops ? negative?.value : analysis?.byKey.leads.value,
                    )}
                  </strong>
                  <span>
                    {ops ? "Artículos en negativo" : "Acciones de contacto"}
                  </span>
                </div>
                <div>
                  <strong>
                    {ops
                      ? number(pending?.value)
                      : money(analysis?.byKey.adSpend.value, account.currency)}
                  </strong>
                  <span>
                    {ops ? "Pendientes de plataforma" : "Inversión Ads"}
                  </span>
                </div>
                <div>
                  <strong>{number(open)}</strong>
                  <span>Tareas de Antuario</span>
                </div>
              </div>
              <p className="account-source">
                {ops
                  ? negative
                    ? `Plataforma al ${shortDate(negative.period_to)}`
                    : "Operación pendiente de actualizar"
                  : analysis
                    ? `Informe: ${shortDate(analysis.range.from)}–${shortDate(analysis.range.to)}`
                    : "Último informe pendiente"}
              </p>
              <footer className="account-card-footer">
                <span>
                  {money(account.monthly_fee, account.currency)}
                  {account.billing_cadence === "weekly"
                    ? " cada sábado"
                    : " mensuales + IVA"}
                </span>
                <span aria-hidden="true">↗</span>
              </footer>
            </Link>
          );
        })}
      </div>
      <Surface
        title="Prioridades de dirección"
        description="Siguiente acción por cliente"
      >
        <div className="account-existing-work">
          {fronts.length ? (
            fronts.slice(0, 10).map(({ account, front }) => (
              <article key={front.id}>
                <div className="account-existing-work-heading">
                  <h3>
                    {account.name} · {front.title}
                  </h3>
                  <Status value={front.health} />
                </div>
                <p>{text(front.next_action)}</p>
                <small>
                  {account.director_name} · {text(front.status)}
                </small>
              </article>
            ))
          ) : (
            <p className="account-source">
              Las prioridades se registran desde la ficha de cada cuenta.
            </p>
          )}
        </div>
      </Surface>
    </>
  );
}
