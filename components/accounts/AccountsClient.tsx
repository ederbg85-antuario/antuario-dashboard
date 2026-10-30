"use client";
import {useFinancialPrivacy,FinancialPrivacyToggle,FinancialText} from "@/components/privacy/FinancialPrivacy";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { AccountPresentation } from "@/lib/client-account-presentation";
import { latestMarketingRange } from "@/lib/client-account-reporting";
import {
  AccountContactActions,
  AccountMonthlyTraffic,
  AccountAcquisitionOutcome,
  isMetricaAccount,
} from "./AccountAcquisitionSummary";
import { AccountOperationsOverview } from "./AccountOperationsOverview";
import { AccountExistingWork } from "./AccountExistingWork";
import { AccountWeeklyCollections } from "./AccountWeeklyCollections";
import { AccountDirectory as Directory } from "./AccountDirectory";
import type {
  AccountAttachment,
  AccountBundle,
  AccountInstance,
  AccountProfile,
  AccountRecordKind,
  AccountsListResponse,
} from "@/lib/client-accounts-types";
import {
  accountMetrics,
  mexicoAccountDate,
  resolveAccountsRange,
  type AccountsRangePreset,
} from "@/lib/client-accounts-metrics";
import {
  AccountDialog,
  Empty,
  fullDate,
  Kpi,
  LoadingAccounts,
  number,
  shortDate,
  Status,
  Surface,
} from "./AccountPrimitives";
import {
  accountForm,
  RecordForm,
  type AccountForm,
  type AccountSave,
} from "./AccountForms";
import {
  AdsHistoryChart,
  BillingChart,
  BudgetCard,
  CampaignTable,
  KpiGrid,
  PerformancePanel,
  TrafficChart,
  SeoTrendChart,
} from "./AccountLazyCharts";
import { accountHasPaidAds, accountFinanceIsPartial } from "./account-scope";
import "./accounts.css";
gsap.registerPlugin(useGSAP);
const EMPTY_BUNDLES: AccountBundle[] = [];
const EMPTY_PRESENTATIONS: Record<string, AccountPresentation> = {};
type AccountViewPreset = AccountsRangePreset | "report";
const isOperationsAccount = (account: AccountProfile) =>
  account.id === "a69fe8b1-14f5-4033-9cda-dc55d9e2726d";
const samePresentationRange = (
  presentation: AccountPresentation | undefined,
  range: ReturnType<typeof resolveAccountsRange>,
) =>
  !!presentation &&
  ["from", "to", "previousFrom", "previousTo"].every(
    (key) =>
      presentation.range[key as keyof typeof presentation.range] ===
      range[key as keyof typeof range],
  );
const tabs = [
  ["resumen", "Resumen"],
  ["rendimiento", "Rendimiento"],
  ["operacion", "Operación"],
  ["entregables", "Entregables"],
  ["canales", "Canales"],
  ["cobranza", "Cobranza"],
] as const;
const workStates = [
  ["pending", "Por hacer"],
  ["in_progress", "En curso"],
  ["review", "En revisión"],
  ["delivered", "Entregado"],
  ["blocked", "Bloqueado"],
] as const;
const exampleQuery = (example: boolean) => (example ? "?demo=1" : "");
const safeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
};
const recordValues = (value: object) =>
  ({ ...value }) as Record<string, unknown>;
const logoFor = (account: AccountProfile) =>
  account.logo_url ??
  (account.name.toLocaleLowerCase().includes("acriland")
    ? "/accounts/acriland.png"
    : account.name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLocaleLowerCase()
          .includes("metrica")
      ? "/accounts/metrica-btl.png"
      : null);
export default function AccountsClient({
  accountId,
  embedded = false,
  example = false,
  initialTab = "resumen",
  initialList = null,
  initialBundles = EMPTY_BUNDLES,
  initialBundle = null,
  initialPresentation,
  initialPresentations = EMPTY_PRESENTATIONS,
}: {
  accountId?: string;
  embedded?: boolean;
  example?: boolean;
  initialTab?: string;
  initialList?: AccountsListResponse | null;
  initialBundles?: AccountBundle[];
  initialBundle?: AccountBundle | null;
  initialPresentation?: AccountPresentation;
  initialPresentations?: Record<string, AccountPresentation>;
}) {
  const {money}=useFinancialPrivacy()
  const root = useRef<HTMLDivElement>(null),
    [list, setList] = useState<AccountsListResponse | null>(initialList),
    [bundles, setBundles] = useState<AccountBundle[]>(() =>
      initialBundles.length
        ? initialBundles
        : Object.values(initialPresentations).map((p) => p.bundle),
    ),
    [bundle, setBundle] = useState<AccountBundle | null>(
      initialPresentation?.bundle ?? initialBundle,
    ),
    [loading, setLoading] = useState(
      !initialList && !initialBundle && !initialPresentation,
    ),
    [presentationActive, setPresentationActive] = useState(
      !!initialPresentation || Object.keys(initialPresentations).length > 0,
    ),
    [snapshotsDeferred, setSnapshotsDeferred] = useState(
      initialPresentation?.snapshotsDeferred ??
        Object.values(initialPresentations).some((p) => p.snapshotsDeferred),
    ),
    [error, setError] = useState(""),
    [tab, setTab] = useState(
      tabs.some(([key]) => key === initialTab) ? initialTab : "resumen",
    ),
    [preset, setPreset] = useState<AccountViewPreset>(
      initialPresentation?.range.preset === "custom" ? "report" : "month",
    ),
    [custom, setCustom] = useState({
      from: initialPresentation?.range.from ?? "",
      to: initialPresentation?.range.to ?? "",
    }),
    [rangeError, setRangeError] = useState(""),
    [archived, setArchived] = useState(false),
    [form, setForm] = useState<AccountForm | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<{
      attachment: AccountAttachment;
      url: string;
    } | null>(null),
    [campaignId, setCampaignId] = useState<string | null>(null),
    [channel, setChannel] = useState<string | null>(null),
    [operationView, setOperationView] = useState<"kanban" | "calendar">(
      "kanban",
    );
  const initialSource = useRef(
      initialList || initialBundle || initialPresentation
        ? `${accountId ?? "directory"}:${example}`
        : null,
    ),
    firstMotion = useRef(true);
  const controller = useRef<AbortController | null>(null),
    uploadSource = useRef<{ fingerprint: string; key: string } | null>(null),
    rawLoad = useRef<Promise<boolean> | null>(null),
    desiredCustom = useRef(custom);
  const load = useCallback(async () => {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError("");
    try {
      if (example) {
        const fixtures = await import("@/lib/client-accounts-fixtures");
        if (accountId) {
          const demo = fixtures.getDemoAccount(accountId);
          if (!demo) throw new Error("No encontramos esa cuenta de ejemplo.");
          setBundle(demo);
        } else {
          const demos = fixtures.getDemoAccounts();
          setBundles(demos);
          setList({
            accounts: demos.map((d) => d.account),
            schema_ready: true,
            server_time: demos[0]?.server_time ?? new Date().toISOString(),
            capabilities: { coordinate: true },
            errors: [],
          });
        }
      } else {
        const response = await fetch(
          accountId
            ? `/api/accounts/${encodeURIComponent(accountId)}`
            : "/api/accounts",
          { cache: "no-store", signal: request.signal },
        );
        const payload = await response.json();
        if (
          !response.ok &&
          !(
            response.status === 503 &&
            payload.schema_ready === false &&
            (accountId
              ? payload.account?.id === accountId
              : Array.isArray(payload.accounts))
          )
        )
          throw new Error(payload.error ?? "No se pudo consultar la cuenta.");
        if (request.signal.aborted) return false;
        if (accountId) setBundle(payload as AccountBundle);
        else {
          const listing = payload as AccountsListResponse;
          const details = await Promise.all(
            listing.accounts.map(async (account) => {
              const res = await fetch(
                `/api/accounts/${encodeURIComponent(account.id)}`,
                { cache: "no-store", signal: request.signal },
              );
              const detail = await res.json();
              if (
                !res.ok &&
                !(
                  res.status === 503 &&
                  detail.schema_ready === false &&
                  detail.account?.id === account.id
                )
              )
                throw new Error(
                  detail.error ??
                    "No se pudo actualizar una de las cuentas. Se conservó la información anterior.",
                );
              if (detail.account?.id !== account.id)
                throw new Error(
                  "La respuesta de una cuenta no pudo verificarse. Se conservó la información anterior.",
                );
              return detail as AccountBundle;
            }),
          );
          if (request.signal.aborted) return false;
          setList(listing);
          setBundles(details);
        }
      }
      if (request.signal.aborted) return false;
      setSnapshotsDeferred(false);
      setPresentationActive(false);
      return true;
    } catch (e) {
      if (!request.signal.aborted)
        setError(
          e instanceof Error ? e.message : "No se pudo cargar la información.",
        );
      return false;
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [accountId, example]);
  useEffect(() => {
    if (initialSource.current === `${accountId ?? "directory"}:${example}`)
      return () => controller.current?.abort();
    let mounted = true;
    void Promise.resolve().then(() => {
      if (mounted) void load();
    });
    return () => {
      mounted = false;
      controller.current?.abort();
    };
  }, [load, accountId, example]);
  const asOf = mexicoAccountDate(
    new Date(
      bundle?.server_time ?? list?.server_time ?? new Date().toISOString(),
    ),
  );
  const range = useMemo(() => {
    try {
      if (preset === "report")
        return (
          (snapshotsDeferred
            ? initialPresentation?.marketingRange
            : bundle
              ? latestMarketingRange(bundle)
              : null) ??
          initialPresentation?.range ??
          resolveAccountsRange("month", asOf)
        );
      return resolveAccountsRange(
        preset,
        asOf,
        preset === "custom" ? custom : undefined,
      );
    } catch {
      return resolveAccountsRange("month", asOf);
    }
  }, [preset, asOf, custom, bundle, initialPresentation, snapshotsDeferred]);
  const needsMarketingMetrics =
    ["resumen", "rendimiento", "canales"].includes(tab) || !!campaignId;
  const analysis = useMemo(() => {
    if (!bundle) return null;
    if (presentationActive && samePresentationRange(initialPresentation, range))
      return initialPresentation!.analysis;
    if (snapshotsDeferred) return null;
    return accountMetrics(
      needsMarketingMetrics ? bundle : { ...bundle, snapshots: [] },
      range,
    );
  }, [
    bundle,
    range,
    needsMarketingMetrics,
    presentationActive,
    initialPresentation,
    snapshotsDeferred,
  ]);
  const channelAnalysis = useMemo(
    () =>
      bundle && channel
        ? accountMetrics(
            {
              ...bundle,
              snapshots: bundle.snapshots.filter((row) =>
                row.source === "ga4"
                  ? row.channel === channel
                  : channel === "organic"
                    ? row.source === "search_console"
                    : channel === "paid"
                      ? row.source === "google_ads"
                      : false,
              ),
            },
            range,
          )
        : null,
    [bundle, channel, range],
  );
  const paidAds = bundle
      ? accountHasPaidAds(
          bundle.account,
          bundle,
          presentationActive && !!initialPresentation?.hadGoogleAdsSnapshots,
        )
      : false,
    financePartial = bundle ? accountFinanceIsPartial(bundle) : false;
  const operational = !!bundle && isOperationsAccount(bundle.account);
  const metrica = !!bundle && isMetricaAccount(bundle);
  const navigationTabs = tabs.map(([key, label]) => [
    key,
    operational
      ? ((
          {
            rendimiento: "Operación del taller",
            operacion: "Soporte y tareas",
            entregables: "Evidencias",
            canales: "SEO e IA",
            cobranza: "Cobros semanales",
          } as Record<string, string>
        )[key] ?? label)
      : metrica
        ? ((
            {
              rendimiento: "Captación",
              operacion: "Plan y entregas",
              entregables: "Reportes",
              canales: "SEO y campañas",
              cobranza: "Facturación",
            } as Record<string, string>
          )[key] ?? label)
        : label,
  ]);
  const manage =
    !!bundle &&
    !example &&
    bundle.schema_ready &&
    bundle.capabilities.manage &&
    !bundle.capabilities.archived;
  const billing =
    !!bundle &&
    !example &&
    bundle.schema_ready &&
    bundle.capabilities.manage_billing &&
    !bundle.capabilities.archived;
  useGSAP(
    () => {
      if (!root.current || loading) return;
      if (firstMotion.current) {
        firstMotion.current = false;
        return;
      }
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-account-enter]:not(.account-heading)", {
          y: 10,
          duration: 0.28,
          stagger: 0.025,
          ease: "power3.out",
          clearProps: "all",
        });
      });
      return () => media.revert();
    },
    {
      scope: root,
      dependencies: [tab, archived, preset, range.from, range.to, loading],
      revertOnUpdate: true,
    },
  );
  async function ensureSnapshots() {
    if (!snapshotsDeferred) return true;
    if (rawLoad.current) return rawLoad.current;
    const pending = load();
    rawLoad.current = pending;
    try {
      return await pending;
    } finally {
      if (rawLoad.current === pending) rawLoad.current = null;
    }
  }
  function commitTab(next: string) {
    setTab(next);
    setChannel(null);
    if (embedded) return;
    const url = new URL(window.location.href);
    if (next === "resumen") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  async function changeTab(next: string) {
    if (
      ["resumen", "rendimiento", "canales"].includes(next) &&
      !(await ensureSnapshots())
    )
      return;
    if (next === "cobranza" && (preset === "report" || operational)) setPreset("month");
    if (
      tab === "cobranza" &&
      ["resumen", "rendimiento", "canales"].includes(next) &&
      metrica &&
      (initialPresentation?.marketingRange ||
        (bundle && latestMarketingRange(bundle)))
    )
      setPreset("report");
    if (operational && next === "canales") {
      const seo =
        initialPresentation?.seoRange ??
        (bundle ? latestMarketingRange(bundle, "search_console") : null);
      if (seo) {
        desiredCustom.current = { from: seo.from, to: seo.to };
        setCustom({ from: seo.from, to: seo.to });
        setPreset("custom");
      }
    }
    commitTab(next);
  }
  async function openChannel(key: string) {
    if (!(await ensureSnapshots())) return;
    commitTab("canales");
    setChannel(key);
  }
  async function openCampaign(id: string) {
    if (!(await ensureSnapshots())) return;
    setCampaignId(id);
  }
  async function choosePreset(next: AccountViewPreset) {
    if (!(await ensureSnapshots())) return;
    setRangeError("");
    if (next === "custom" && !custom.from) {
      const dates = { from: range.from, to: range.to };
      desiredCustom.current = dates;
      setCustom(dates);
    }
    setPreset(next);
  }
  async function changeCustom(key: "from" | "to", value: string) {
    desiredCustom.current = { ...desiredCustom.current, [key]: value };
    if (!(await ensureSnapshots())) return;
    const next = desiredCustom.current;
    setCustom(next);
    try {
      resolveAccountsRange("custom", asOf, next);
      setRangeError("");
    } catch {
      setRangeError("Selecciona un rango válido.");
    }
  }
  const save: AccountSave = async (
    kind,
    data,
    id,
    expectedUpdatedAt,
    sourceKey,
  ) => {
    if (!bundle || example)
      throw new Error("El modo de ejemplo no guarda cambios.");
    const response = await fetch(
      `/api/accounts/${encodeURIComponent(bundle.account.id)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "profile"
            ? {
                action: "profile",
                data,
                expected_updated_at: expectedUpdatedAt,
              }
            : {
                action: "save",
                kind,
                data,
                source_key:
                  sourceKey ??
                  (id
                    ? (
                        bundle[kind] as { id: string; source_key: string }[]
                      ).find((row) => row.id === id)?.source_key
                    : null) ??
                  crypto.randomUUID(),
                ...(id ? { id, expected_updated_at: expectedUpdatedAt } : {}),
              },
        ),
      },
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar.");
    setNotice("Cambio guardado con tu usuario.");
    await load();
    return true;
  };
  function openForm(
    kind: AccountRecordKind | "profile",
    values?: Record<string, unknown>,
  ) {
    if (!bundle) return;
    setForm(accountForm(kind, bundle, values));
  }
  async function updateInstance(
    instance: AccountInstance,
    status: AccountInstance["status"],
  ) {
    if (!bundle) return;
    if (
      (["delivered", "review"].includes(status) && !instance.evidence.trim()) ||
      (status === "blocked" && !instance.blocked_reason.trim())
    ) {
      openForm("instances", { ...instance, status });
      return;
    }
    setBusy(true);
    setError("");
    try {
      await save(
        "instances",
        {
          status,
          title: instance.title,
          due_date: instance.due_date,
          assignee_member_id: instance.assignee_member_id,
          template_id: instance.template_id,
          evidence: instance.evidence,
          blocked_reason: status === "blocked" ? instance.blocked_reason : "",
          period_from: instance.period_from,
          period_to: instance.period_to,
        },
        instance.id,
        instance.updated_at,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se actualizó el encargo.");
    } finally {
      setBusy(false);
    }
  }
  async function materialize() {
    if (!bundle || !manage) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/accounts/${bundle.account.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "materialize",
          period_from: range.from,
          period_to: range.to,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "No se generaron los encargos.");
      setNotice(
        "Calendario actualizado. Las instancias existentes se conservan.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se generaron los encargos.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function attachmentUrl(attachment: AccountAttachment) {
    if (!bundle) return null;
    if (example) {
      setNotice(
        "Este archivo es una referencia de ejemplo; no contiene un documento real.",
      );
      return null;
    }
    const response = await fetch(
      `/api/accounts/${bundle.account.id}/attachments/${attachment.id}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? "No se pudo abrir el archivo.");
    return String(data.url);
  }
  async function openAttachment(attachment: AccountAttachment) {
    try {
      const url = await attachmentUrl(attachment);
      if (url) setPreview({ attachment, url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el archivo.");
    }
  }
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!bundle || example) return;
    const f = new FormData(e.currentTarget),
      file = f.get("file");
    if (!(file instanceof File) || !file.size) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 4 * 1024 * 1024)
        throw new Error("El tamaño máximo es 4 MB.");
      const fingerprint = [
        file.name,
        file.size,
        file.lastModified,
        f.get("stage"),
        f.get("version"),
        f.get("instance_id"),
        f.get("work_id"),
      ].join("|");
      if (uploadSource.current?.fingerprint !== fingerprint)
        uploadSource.current = { fingerprint, key: crypto.randomUUID() };
      f.set("source_key", uploadSource.current.key);
      const response = await fetch(
        `/api/accounts/${bundle.account.id}/attachments`,
        { method: "POST", body: f },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "No se pudo subir el archivo.");
      uploadSource.current = null;
      setNotice("Archivo guardado en almacenamiento privado.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el archivo.");
    } finally {
      setBusy(false);
    }
  }
  const filterControl = (
    <div className="account-range">
      <select
        aria-label="Periodo de la cuenta"
        value={preset}
        disabled={loading}
        onChange={(e) => void choosePreset(e.target.value as AccountViewPreset)}
      >
        {(initialPresentation?.marketingRange ||
          (bundle && latestMarketingRange(bundle))) && (
          <option value="report">
            {initialPresentation?.marketingRange?.label ??
              "Último informe disponible"}
          </option>
        )}
        <option value="7d">7 días</option>
        <option value="30d">30 días</option>
        <option value="month">Mes a la fecha</option>
        <option value="quarter">Trimestre a la fecha</option>
        <option value="custom">Personalizado</option>
      </select>
      {preset === "custom" && (
        <>
          <input
            type="date"
            aria-label="Periodo desde"
            value={custom.from}
            disabled={loading}
            onChange={(e) => void changeCustom("from", e.target.value)}
          />
          <input
            type="date"
            aria-label="Periodo hasta"
            value={custom.to}
            disabled={loading}
            onChange={(e) => void changeCustom("to", e.target.value)}
          />
        </>
      )}
      <span>
        {shortDate(range.from)}–{shortDate(range.to)} · vs.{" "}
        {shortDate(range.previousFrom)}–{shortDate(range.previousTo)}
      </span>
    </div>
  );
  if (loading && !bundle && !list) return <LoadingAccounts />;
  const visibleAccounts = (list?.accounts ?? []).filter(
    (account) => (account.status === "archived") === archived,
  );
  return (
    <div ref={root} className="accounts-workspace" data-embedded={embedded} data-tab={tab} aria-busy={loading}>
      <div className="account-topline">
        <div>
          {accountId ? (
            <nav className="account-breadcrumb" aria-label="Ubicación">
              <Link href={`/cuentas${exampleQuery(example)}`}>Cuentas</Link>
              <span>›</span>
              {bundle?.account.name ?? "Detalle"}
            </nav>
          ) : (
            <>
              <h1 className="account-page-title">Cuentas</h1>
              <p className="account-page-caption">
                Rendimiento, entregas y cobranza por cliente.
              </p>
            </>
          )}
        </div>
        <div className="account-actions">
          <FinancialPrivacyToggle/>
          <Link
            className="account-link-action"
            href={
              example
                ? accountId
                  ? "/cuentas"
                  : "/cuentas"
                : accountId
                  ? `/cuentas/${bundle?.account.name.toLocaleLowerCase().includes("acriland") ? "acriland" : "metrica"}?demo=1`
                  : "/cuentas?demo=1"
            }
          >
            {example ? "Volver a datos reales" : "Ver ejemplo"}
          </Link>
          <button
            className="account-action"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Actualizando…" : "Actualizar ↻"}
          </button>
          {accountId && manage && (
            <button
              className="account-action is-primary"
              onClick={() => openForm("profile")}
            >
              Editar cuenta
            </button>
          )}
        </div>
      </div>
      {example && (
        <div className="account-banner is-example" role="status">
          <p>
            <strong>Datos de ejemplo.</strong> Solo para revisar diseño e
            interacciones; no son resultados de clientes ni se guardan en
            producción.
          </p>
        </div>
      )}
      {error && (
        <div className="account-banner is-error" role="alert">
          <p>{error}</p>
          <button onClick={() => void load()}>Reintentar</button>
        </div>
      )}
      {notice && (
        <div className="account-banner" role="status">
          <p>{notice}</p>
          <button onClick={() => setNotice("")}>Cerrar</button>
        </div>
      )}
      {rangeError && (
        <div className="account-banner is-error" role="alert">
          {rangeError}
        </div>
      )}
      {!accountId && list && (
        <>
          {!list.schema_ready && (
            <div className="account-notice">
              Las cuentas existentes se conservan. El nuevo módulo está en vista
              previa; sus tablas aún no están habilitadas en esta fuente.
            </div>
          )}
          <div className="account-toolbar">
            <nav className="account-tabs" aria-label="Estado de las cuentas">
              <button
                aria-pressed={!archived}
                onClick={() => setArchived(false)}
              >
                Activas
              </button>
              <button aria-pressed={archived} onClick={() => setArchived(true)}>
                Archivadas · lectura
              </button>
            </nav>
          </div>
          <Directory
            accounts={visibleAccounts}
            bundles={bundles}
            example={example}
            archived={archived}
            prepared={
              presentationActive ? initialPresentations : EMPTY_PRESENTATIONS
            }
          />
          {!visibleAccounts.length && (
            <Surface
              title={archived ? "Historial de cuentas" : "Cuentas activas"}
            >
              <Empty
                title={
                  archived
                    ? "Sin cuentas archivadas visibles"
                    : "Sin cuentas asignadas"
                }
                description="Solo se muestran las cuentas permitidas para tu usuario."
              />
            </Surface>
          )}
        </>
      )}
      {accountId && bundle && analysis && (
        <>
          {!bundle.schema_ready && (
            <div className="account-notice">
              Vista previa del módulo. Se muestran los datos existentes
              disponibles; las funciones nuevas de registro se habilitarán con
              la migración.
            </div>
          )}
          {bundle.capabilities.archived && (
            <div className="account-banner">
              <p>
                <strong>Cuenta archivada.</strong> Su historial se conserva en
                modo de lectura.
              </p>
            </div>
          )}
          <header
            className={`account-surface account-heading ${bundle.account.name.toLocaleLowerCase().includes("acriland") ? "is-acriland" : ""}`}
            data-account-enter
          >
            <div className="account-heading-main">
              <div className="account-monogram">
                {logoFor(bundle.account) ? (
                  <Image
                    src={logoFor(bundle.account)!}
                    width={56}
                    height={56}
                    unoptimized
                    alt={`Logo ${bundle.account.name}`}
                  />
                ) : bundle.account.name === "Métrica BTL" ? (
                  "M"
                ) : (
                  bundle.account.name.charAt(0)
                )}
              </div>
              <div>
                <h1>{bundle.account.name}</h1>
                <div className="account-meta">
                  <Status value={bundle.account.status} />
                  <span>
                    {bundle.account.director_name ?? "Dirección por asignar"}
                  </span>
                  <Status value={bundle.account.health} />
                </div>
                <div className="account-services">
                  {bundle.account.services
                    .filter(
                      (service) =>
                        paidAds ||
                        !/google\s*ads|publicidad\s+pagada/i.test(service),
                    )
                    .map((service) => (
                      <span className="account-chip" key={service}>
                        {service}
                      </span>
                    ))}
                </div>
              </div>
            </div>
            <div className="account-heading-money">
              <span>
                {bundle.account.billing_cadence === "weekly"
                  ? "Cobro semanal"
                  : "Iguala mensual"}{" "}
                · {bundle.account.currency}
              </span>
              <strong>
                {money(bundle.account.monthly_fee, bundle.account.currency)}
              </strong>
              <small>
                <FinancialText>{bundle.account.fee_basis ?? "Acuerdo por verificar"}</FinancialText>
              </small>
            </div>
          </header>
          <div className="account-toolbar">
            <nav className="account-tabs" aria-label="Espacio de la cuenta">
              {navigationTabs.map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={tab === key}
                  onClick={() => changeTab(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            {!(operational && ["resumen", "rendimiento"].includes(tab)) &&
              filterControl}
          </div>
          {tab === "resumen" && (
            <>
              {operational ? (
                <AccountOperationsOverview bundle={bundle} compact />
              ) : (
                <KpiGrid analysis={analysis} compact paidAds={paidAds} />
              )}
              {bundle.account.summary && (
                <div className="account-next-action">
                  <span aria-hidden="true">↗</span>
                  <p>
                    {bundle.account.summary}
                    <small>
                      Próximo paso de{" "}
                      {bundle.account.director_name ?? "la cuenta"}
                    </small>
                  </p>
                </div>
              )}
              <div className="account-grid is-asymmetric">
                {operational ? (
                  <AccountExistingWork bundle={bundle} compact onChanged={()=>void load()} />
                ) : metrica ? (
                  <AccountContactActions bundle={bundle} range={range} />
                ) : (
                  <TrafficChart analysis={analysis} />
                )}
                <Fronts
                  bundle={bundle}
                  paidAds={paidAds}
                  manage={manage}
                  edit={(values) => openForm("fronts", values)}
                  add={() => openForm("fronts")}
                />
                <Contacts
                  bundle={bundle}
                  manage={manage}
                  add={() => openForm("contacts")}
                  edit={(values) => openForm("contacts", values)}
                />
                <Milestones
                  bundle={bundle}
                  manage={manage}
                  add={() => openForm("milestones")}
                />
                {metrica && <AccountExistingWork bundle={bundle} compact onChanged={()=>void load()} />}
                {metrica && <AccountMonthlyTraffic bundle={bundle} />}
              </div>
            </>
          )}
          {tab === "rendimiento" &&
            (operational ? (
              <AccountOperationsOverview bundle={bundle} />
            ) : metrica ? (
              <>
                <KpiGrid analysis={analysis} paidAds={paidAds} />
                <div className="account-grid">
                  <AccountMonthlyTraffic bundle={bundle} />
                  <AccountContactActions bundle={bundle} range={range} />
                  <SeoTrendChart analysis={analysis} />
                  <AccountAcquisitionOutcome
                    bundle={bundle}
                    range={range}
                    spend={analysis.byKey.adSpend.value}
                    conversions={analysis.byKey.conversions.value}
                  />
                </div>
                {!!analysis.campaignRows.length && (
                  <CampaignTable
                    historical={metrica}
                    analysis={analysis}
                    onCampaign={(id) => void openCampaign(id)}
                  />
                )}
              </>
            ) : (
              <PerformancePanel
                bundle={bundle}
                range={range}
                analysis={analysis}
                paidAds={paidAds}
                onCampaign={(id) => void openCampaign(id)}
                onChannel={(key) => void openChannel(key)}
              />
            ))}
          {tab === "operacion" && (
            <>
              <AccountExistingWork bundle={bundle} onChanged={()=>void load()} />
              <div className="account-topline">
                <div className="account-tabs" aria-label="Vista de encargos">
                  <button
                    aria-pressed={operationView === "kanban"}
                    onClick={() => setOperationView("kanban")}
                  >
                    Kanban
                  </button>
                  <button
                    aria-pressed={operationView === "calendar"}
                    onClick={() => setOperationView("calendar")}
                  >
                    Calendario
                  </button>
                </div>
                <div className="account-actions">
                  <span className="account-chip">
                    {analysis.overdue} vencidos
                  </span>
                  {manage && (
                    <button
                      className="account-action"
                      onClick={() => openForm("instances")}
                    >
                      ＋ Encargo
                    </button>
                  )}
                </div>
              </div>
              {operationView === "kanban" ? (
                <div className="account-kanban">
                  {workStates.map(([status, label]) => (
                    <section className="account-kanban-column" key={status}>
                      <header>
                        <strong role="heading" aria-level={2}>
                          {label}
                        </strong>
                        <span>
                          {
                            bundle.instances.filter((i) => i.status === status)
                              .length
                          }
                        </span>
                      </header>
                      {bundle.instances
                        .filter((i) => i.status === status)
                        .map((instance) => (
                          <InstanceCard
                            key={instance.id}
                            instance={instance}
                            bundle={bundle}
                            today={asOf}
                            busy={busy}
                            example={example}
                            update={updateInstance}
                            edit={() =>
                              openForm("instances", recordValues(instance))
                            }
                          />
                        ))}
                      {!bundle.instances.some((i) => i.status === status) && (
                        <p className="account-source">Sin encargos</p>
                      )}
                    </section>
                  ))}
                </div>
              ) : (
                <Calendar
                  instances={bundle.instances}
                  today={asOf}
                  month={range.to.slice(0, 7)}
                  onInstance={(instance) =>
                    openForm("instances", recordValues(instance))
                  }
                  editable={manage && !example}
                />
              )}
              <Surface
                title="Encargos recurrentes"
                description={
                  bundle.account.name.toLocaleLowerCase().includes("acriland")
                    ? "Soporte, revisión de agentes y reporte de marketing"
                    : "Reportes, revisión de campañas y documentos de cobro"
                }
                action={
                  manage ? (
                    <div className="account-actions">
                      <button
                        className="account-action"
                        disabled={busy}
                        onClick={() => void materialize()}
                      >
                        Generar periodo
                      </button>
                      <button
                        className="account-action is-primary"
                        onClick={() => openForm("templates")}
                      >
                        ＋ Plantilla
                      </button>
                    </div>
                  ) : undefined
                }
              >
                {bundle.templates.length ? (
                  <div className="account-template-list">
                    {bundle.templates.map((template) => (
                      <div className="account-template-row" key={template.id}>
                        <div>
                          <strong>{template.title}</strong>
                          <span>
                            {
                              {
                                weekly: "Semanal",
                                monthly: "Mensual",
                                quarterly: "Trimestral",
                              }[template.frequency]
                            }{" "}
                            · día {template.day} ·{" "}
                            {template.enabled ? "Activa" : "Pausada"}
                          </span>
                        </div>
                        {manage && (
                          <button
                            className="account-action"
                            onClick={() =>
                              openForm("templates", recordValues(template))
                            }
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="Sin plantillas todavía"
                    description="El director de cuenta puede programar reportes, revisiones y documentos con un responsable y una fecha."
                  />
                )}
              </Surface>
            </>
          )}
          {tab === "entregables" && (
            <>
              {(manage || bundle.capabilities.upload) &&
                !example &&
                bundle.schema_ready &&
                !bundle.capabilities.archived && (
                  <form className="account-surface" onSubmit={upload}>
                    <header className="account-card-heading">
                      <div>
                        <h2>Nuevo entregable</h2>
                        <p>Almacenamiento privado · máximo 4 MB</p>
                      </div>
                    </header>
                    <div className="account-form">
                      <label className="account-field is-wide">
                        <span>PDF, PNG, JPG o WebP</span>
                        <input
                          name="file"
                          type="file"
                          accept="application/pdf,image/png,image/jpeg,image/webp"
                          required
                        />
                      </label>
                      <label className="account-field">
                        <span>Versión</span>
                        <input
                          name="version"
                          type="number"
                          min="1"
                          step="1"
                          defaultValue="1"
                          required
                        />
                      </label>
                      <label className="account-field">
                        <span>Estado</span>
                        <select name="stage" defaultValue="draft">
                          <option value="draft">Borrador</option>
                          <option value="final">Final</option>
                        </select>
                      </label>
                      <label className="account-field is-wide">
                        <span>Encargo relacionado</span>
                        <select name="instance_id" defaultValue="">
                          <option value="">Sin relación</option>
                          {bundle.instances
                            .filter(
                              (i) =>
                                manage ||
                                i.assignee_member_id ===
                                  bundle.capabilities.member_id,
                            )
                            .map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.title}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="account-field is-wide">
                        <span>ID de encargo de Equipo (opcional)</span>
                        <input
                          name="work_id"
                          placeholder="UUID del encargo"
                          pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                        />
                        <small>
                          Vincula la evidencia con una conversación de Equipo →
                          Trabajo.
                        </small>
                      </label>
                      <div className="account-form-actions">
                        <button
                          disabled={busy}
                          className="account-action is-primary"
                        >
                          {busy ? "Subiendo…" : "Subir entregable"}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              <div style={{ height: 20 }} />
              <Surface
                title="Archivos y versiones"
                description="PDF, imágenes y capturas con su encargo"
              >
                {bundle.attachments.length ? (
                  <div className="account-file-grid">
                    {bundle.attachments.map((file) => (
                      <article className="account-file" key={file.id}>
                        <div className="account-file-preview">
                          <AttachmentThumb
                            file={file}
                            accountId={bundle.account.id}
                            example={example}
                          />
                          <button
                            aria-label={`Ver ${file.name}`}
                            onClick={() => void openAttachment(file)}
                          >
                            {file.mime_type === "application/pdf" ? (
                              "PDF"
                            ) : (
                              <span className="sr-only">Ver imagen</span>
                            )}
                          </button>
                        </div>
                        <div className="account-file-body">
                          <h3>{file.name}</h3>
                          <div className="account-file-version">
                            <Status
                              value={file.stage}
                              label={
                                file.stage === "final" ? "Final" : "Borrador"
                              }
                            />
                            <span>v{file.version}</span>
                          </div>
                          <p>
                            {number(file.size / 1024, 1)} KB ·{" "}
                            {shortDate(file.created_at)}
                          </p>
                          {file.instance_id && (
                            <p>
                              {bundle.instances.find(
                                (i) => i.id === file.instance_id,
                              )?.title ?? "Encargo relacionado"}
                            </p>
                          )}
                          <button
                            className="account-text-button"
                            onClick={() => void openAttachment(file)}
                          >
                            Vista previa ↗
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="Sin entregables adjuntos"
                    description="Sube reportes y evidencia de la cuenta. Cada archivo conservará su versión y responsable."
                  />
                )}
              </Surface>
            </>
          )}
          {tab === "canales" && !paidAds && (
            <>
              <div className="account-notice">
                SEO y visibilidad en IA · {shortDate(range.from)}–
                {shortDate(range.to)}. Las cifras corresponden a la exportación
                histórica de Search Console; no representan tráfico actual ni
                campañas de pago.
              </div>
              <div className="account-kpis">
                {["seoClicks", "seoImpressions", "ctr", "position"].map(
                  (key) => (
                    <Kpi
                      key={key}
                      label={analysis.byKey[key].label}
                      value={
                        analysis.byKey[key].value == null
                          ? "—"
                          : `${number(analysis.byKey[key].value, ["ctr", "position"].includes(key) ? 2 : 0)}${key === "ctr" ? "%" : ""}`
                      }
                      change={
                        analysis.byKey[key].complete
                          ? analysis.byKey[key].change
                          : null
                      }
                      series={analysis.byKey[key].series}
                      hint={analysis.byKey[key].note}
                    />
                  ),
                )}
              </div>
              <div className="account-grid">
                <SeoTrendChart analysis={analysis} />
                <Fronts
                  paidAds={paidAds}
                  bundle={{
                    ...bundle,
                    fronts: bundle.fronts.filter((front) =>
                      /seo|organ|b[uú]squeda|visibilidad|\bia\b|\bai\b/i.test(
                        `${front.key} ${front.title}`,
                      ),
                    ),
                  }}
                  manage={manage}
                  edit={(values) => openForm("fronts", values)}
                  add={() => openForm("fronts")}
                />
                <Milestones
                  bundle={bundle}
                  manage={manage}
                  add={() => openForm("milestones")}
                />
                <Contacts
                  bundle={bundle}
                  manage={manage}
                  add={() => openForm("contacts")}
                  edit={(values) => openForm("contacts", values)}
                />
              </div>
            </>
          )}
          {tab === "canales" && paidAds && (
            <>
              {channel && (
                <div className="account-banner">
                  <p>
                    Detalle de canal:{" "}
                    <strong>
                      {(
                        {
                          organic: "Orgánico",
                          paid: "Pagado",
                          direct: "Directo",
                          referral: "Referido",
                        } as Record<string, string>
                      )[channel] ?? channel}
                    </strong>
                    . Los datos conservan el mismo rango.
                  </p>
                  <button onClick={() => setChannel(null)}>Ver todos</button>
                </div>
              )}
              {channelAnalysis ? (
                <>
                  <KpiGrid analysis={channelAnalysis} compact />
                  <div className="account-grid">
                    <TrafficChart analysis={channelAnalysis} />
                    {channel === "paid" ? (
                      <BudgetCard analysis={channelAnalysis} />
                    ) : (
                      <Surface
                        title="Alcance de este canal"
                        description="GA4 y su dimensión de adquisición"
                      >
                        <p className="account-form-note">
                          Esta vista incluye únicamente snapshots del canal
                          seleccionado. Las conversiones de campañas de pago se
                          consultan desde el canal Pagado.
                        </p>
                      </Surface>
                    )}
                  </div>
                </>
              ) : (
                <div className="account-grid">
                  {metrica ? (
                    <SeoTrendChart analysis={analysis} />
                  ) : (
                    <BudgetCard analysis={analysis} />
                  )}
                  {metrica ? (
                    <AccountContactActions bundle={bundle} range={range} />
                  ) : (
                    <AdsHistoryChart bundle={bundle} analysis={analysis} />
                  )}
                </div>
              )}
              <div className="account-topline">
                <h2 style={{ fontSize: 17, fontWeight: 600 }}>
                  Campañas y decisiones
                </h2>
                {manage && (
                  <div className="account-actions">
                    <button
                      className="account-action"
                      onClick={() => openForm("campaigns")}
                    >
                      ＋ Campaña
                    </button>
                    <button
                      className="account-action is-primary"
                      onClick={() => openForm("changes")}
                    >
                      Registrar cambio
                    </button>
                  </div>
                )}
              </div>
              {!channel || channel === "paid" ? (
                <CampaignTable
                  historical={metrica}
                  analysis={channelAnalysis ?? analysis}
                  onCampaign={(id) => void openCampaign(id)}
                />
              ) : (
                <div className="account-notice">
                  Las campañas de pago se consultan en Pagado. Esta selección
                  mantiene los datos del canal {channel}.
                </div>
              )}
              <div style={{ height: 20 }} />
              {metrica && !bundle.changes.length ? (
                <Fronts
                  bundle={{
                    ...bundle,
                    fronts: bundle.fronts.filter((front) =>
                      ["seo", "ads"].includes(front.key),
                    ),
                  }}
                  paidAds={paidAds}
                  manage={manage}
                  edit={(values) => openForm("fronts", values)}
                  add={() => openForm("fronts")}
                />
              ) : (
                <Surface
                  title="Bitácora de cambios"
                  description="Quién cambió qué, por qué y con qué autorización"
                >
                  {bundle.changes.length ? (
                    <div className="account-timeline">
                      {bundle.changes
                        .filter(
                          (change) =>
                            change.date.slice(0, 10) >= range.from &&
                            change.date.slice(0, 10) <= range.to,
                        )
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((change) => (
                          <article
                            className="account-timeline-item"
                            key={change.id}
                          >
                            <span
                              className="account-timeline-marker"
                              aria-hidden="true"
                            >
                              ↗
                            </span>
                            <div>
                              <h3>
                                {change.action} ·{" "}
                                {bundle.campaigns.find(
                                  (c) => c.id === change.campaign_id,
                                )?.name ?? change.platform}
                              </h3>
                              <p>
                                {change.before} → {change.after}
                              </p>
                              <p>{change.reason}</p>
                              <small>
                                {fullDate(change.date)} · Autorizó:{" "}
                                {change.authorized_by}
                              </small>
                              <small>
                                Actor registrado: {change.created_by}
                              </small>
                              {safeUrl(change.evidence) ? (
                                <a
                                  className="account-text-button"
                                  target="_blank"
                                  rel="noreferrer"
                                  href={safeUrl(change.evidence)!}
                                >
                                  Ver evidencia ↗
                                </a>
                              ) : (
                                <small>Evidencia: {change.evidence}</small>
                              )}
                            </div>
                          </article>
                        ))}
                    </div>
                  ) : (
                    <Empty
                      title="Sin cambios registrados"
                      description="Las acciones en Ads se registran con antes, después, motivo, autorización y evidencia. El dashboard no activa ni pausa campañas por sí solo."
                    />
                  )}
                </Surface>
              )}
            </>
          )}
          {tab === "cobranza" && (
            <>
              {operational && (
                <AccountWeeklyCollections bundle={bundle} range={range} />
              )}
              {(!analysis.billingSummary.hasInvoices ||
                !analysis.billingSummary.hasPayments) && (
                <div className="account-notice">
                  Importes por verificar. La cuota y los cobros previstos no
                  acreditan facturas emitidas ni pagos recibidos.
                </div>
              )}
              {financePartial && (
                <div className="account-notice" role="status">
                  Cobertura financiera parcial
                  {bundle.finance_coverage?.truncated
                    ? " · consulta truncada"
                    : ""}
                  . Los importes facturados y cobrados son solo los registros
                  observados; el saldo total queda por verificar.
                </div>
              )}
              {(!operational ||
                bundle.invoices.length > 0 ||
                bundle.payments.length > 0) && (
                <div className="account-kpis">
                  <Kpi
                    label={financePartial ? "Facturado observado" : "Facturado"}
                    value={money(
                      analysis.billingSummary.hasInvoices
                        ? analysis.billingSummary.invoiced
                        : null,
                      bundle.account.currency,
                    )}
                    hint="Facturas emitidas en el periodo; excluye borradores y canceladas."
                  />
                  <Kpi
                    label={financePartial ? "Cobrado observado" : "Cobrado"}
                    value={money(
                      analysis.billingSummary.hasPayments
                        ? analysis.billingSummary.collected
                        : null,
                      bundle.account.currency,
                    )}
                    hint="Pagos documentados por fecha de recepción."
                  />
                  <Kpi
                    label={
                      financePartial
                        ? "Por cobrar · por verificar"
                        : "Por cobrar"
                    }
                    value={money(
                      !financePartial &&
                        analysis.billingSummary.hasInvoices &&
                        analysis.billingSummary.hasPayments
                        ? analysis.billingSummary.outstanding
                        : null,
                      bundle.account.currency,
                    )}
                    hint="Saldo de facturas emitidas hasta el corte, menos sus pagos aplicados."
                  />
                  <Kpi
                    label="Complementos por verificar"
                    value={number(
                      analysis.billingSummary.hasPayments
                        ? analysis.billingSummary.pendingReceipts
                        : null,
                    )}
                    hint="Sin CFDI de pago vinculado o verificado; no determina que no se haya emitido."
                  />
                </div>
              )}
              {!financePartial &&
                analysis.billingSummary.hasInvoices &&
                analysis.billingSummary.hasPayments &&
                (analysis.billingSummary.daysLate ?? 0) > 0 && (
                  <div className="account-banner is-error">
                    Hay documentos con hasta {analysis.billingSummary.daysLate}{" "}
                    días de atraso.
                  </div>
                )}
              {analysis.billingSummary.foreignCurrencyExcluded && (
                <div className="account-notice">
                  Hay registros en otra moneda; no se mezclan con los totales en{" "}
                  {bundle.account.currency}.
                </div>
              )}
              <div className="account-grid">
                {(!operational ||
                  bundle.invoices.length > 0 ||
                  bundle.payments.length > 0) && (
                  <BillingChart analysis={analysis} />
                )}
                <Surface
                  title="Oportunidades"
                  description="Estimaciones separadas de ingresos"
                  action={
                    manage ? (
                      <button
                        className="account-text-button"
                        onClick={() => openForm("opportunities")}
                      >
                        ＋ Oportunidad
                      </button>
                    ) : undefined
                  }
                >
                  {bundle.opportunities.length ? (
                    bundle.opportunities.map((opportunity) => (
                      <article
                        className="account-opportunity"
                        key={opportunity.id}
                      >
                        <header>
                          <h3>{opportunity.title}</h3>
                          <Status value={opportunity.stage} />
                        </header>
                        <p>{opportunity.next_action}</p>
                        <strong>
                          {money(
                            opportunity.development_estimate,
                            opportunity.currency,
                          )}
                        </strong>
                        <small>
                          Desarrollo estimado ·{" "}
                          {opportunity.tax_basis === "plus_vat"
                            ? "más IVA"
                            : opportunity.tax_basis === "included"
                              ? "IVA incluido"
                              : "IVA por confirmar"}
                        </small>
                        {opportunity.monthly_estimate != null && (
                          <p>
                            Iguala estimada:{" "}
                            {money(
                              opportunity.monthly_estimate,
                              opportunity.currency,
                            )}
                            /mes
                          </p>
                        )}
                        {manage && (
                          <button
                            className="account-text-button"
                            onClick={() =>
                              openForm(
                                "opportunities",
                                recordValues(opportunity),
                              )
                            }
                          >
                            Actualizar
                          </button>
                        )}
                      </article>
                    ))
                  ) : (
                    <Empty
                      title="Sin oportunidades registradas"
                      description="Las propuestas y ampliaciones se mantienen fuera de facturación hasta que exista un documento real."
                    />
                  )}
                </Surface>
              </div>
              <Surface
                title="Facturas y pagos"
                description={
                  bundle.account.name.toLocaleLowerCase().includes("acriland")
                    ? "Cobros semanales separados de la emisión de facturas"
                    : "Emisión, retenciones, cobro y complementos por separado"
                }
                action={
                  billing ? (
                    <div className="account-actions">
                      <button
                        className="account-action"
                        onClick={() => openForm("invoices")}
                      >
                        ＋ Factura
                      </button>
                      <button
                        className="account-action is-primary"
                        onClick={() => openForm("payments")}
                      >
                        ＋ Pago
                      </button>
                    </div>
                  ) : undefined
                }
              >
                {bundle.invoices.length ? (
                  <div className="account-table-scroll">
                    <table className="account-health-table">
                      <thead>
                        <tr>
                          {[
                            "Documento",
                            "Estado",
                            "Vencimiento",
                            "Importe",
                            "Cobrado",
                            "Por cobrar",
                            "Atraso",
                          ].map((label) => (
                            <th key={label}>{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bundle.invoices.map((invoice) => {
                          const totals = analysis.invoices.find(
                            (i) => i.id === invoice.id,
                          );
                          return (
                            <tr key={invoice.id}>
                              <td>
                                <strong>{invoice.title}</strong>
                                <small>
                                  Emitida {shortDate(invoice.issued_date)}
                                </small>
                                {invoice.period_from && invoice.period_to && (
                                  <small>
                                    Servicio: {shortDate(invoice.period_from)}–
                                    {shortDate(invoice.period_to)}
                                  </small>
                                )}
                                {billing && !invoice.read_only && (
                                  <button
                                    className="account-text-button"
                                    onClick={() =>
                                      openForm(
                                        "invoices",
                                        recordValues(invoice),
                                      )
                                    }
                                  >
                                    Editar registro
                                  </button>
                                )}
                              </td>
                              <td>
                                <Status value={invoice.status} />
                              </td>
                              <td>
                                {invoice.due_date
                                  ? shortDate(invoice.due_date)
                                  : "—"}
                              </td>
                              <td>{money(invoice.total, invoice.currency)}</td>
                              <td>
                                {money(
                                  analysis.billingSummary.hasPayments
                                    ? totals?.paid
                                    : null,
                                  invoice.currency,
                                )}
                              </td>
                              <td>
                                {money(
                                  analysis.billingSummary.hasInvoices &&
                                    analysis.billingSummary.hasPayments
                                    ? totals?.outstanding
                                    : null,
                                  invoice.currency,
                                )}
                              </td>
                              <td
                                className={
                                  analysis.billingSummary.hasInvoices &&
                                  analysis.billingSummary.hasPayments &&
                                  totals?.daysLate
                                    ? "account-overdue"
                                    : ""
                                }
                              >
                                {analysis.billingSummary.hasInvoices &&
                                analysis.billingSummary.hasPayments &&
                                totals?.daysLate
                                  ? `${totals.daysLate} días`
                                  : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="Sin facturas registradas"
                    description="Los cobros de Acriland pueden registrarse sin asociarlos a una factura. No se supone que ya se emitió un CFDI."
                  />
                )}
                {bundle.payments.length > 0 && (
                  <details className="account-source">
                    <summary>
                      Ver pagos registrados · {bundle.payments.length}
                    </summary>
                    <div className="account-table-scroll">
                      <table className="account-health-table">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Monto</th>
                            <th>Factura</th>
                            <th>Complemento</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bundle.payments.map((payment) => (
                            <tr key={payment.id}>
                              <td>{shortDate(payment.date)}</td>
                              <td>{money(payment.amount, payment.currency)}</td>
                              <td>
                                {bundle.invoices.find(
                                  (i) => i.id === payment.invoice_id,
                                )?.title ?? "Sin aplicar"}
                              </td>
                              <td>
                                {
                                  {
                                    not_required: "No requerido",
                                    pending: payment.read_only
                                      ? "Por verificar"
                                      : "Pendiente",
                                    issued: "Emitido",
                                  }[payment.receipt_status]
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </Surface>
            </>
          )}
          <footer className="account-source">
            Corte: {fullDate(bundle.server_time)} ·{" "}
            {bundle.data_mode === "example" ? "Ejemplo" : "Fuente de la cuenta"}{" "}
            · {bundle.account.currency}.{" "}
            {bundle.errors.length > 0
              ? "Algunas fuentes no están disponibles; se conserva su estado vacío."
              : ""}
          </footer>
        </>
      )}
      {form && bundle && (
        <RecordForm
          key={`${form.kind}-${form.id ?? "new"}`}
          form={form}
          save={save}
          close={() => setForm(null)}
        />
      )}
      {preview && (
        <AccountDialog
          title={preview.attachment.name}
          close={() => setPreview(null)}
          className="account-preview-dialog"
        >
          {preview.attachment.mime_type === "application/pdf" ? (
            <iframe src={preview.url} title={preview.attachment.name} />
          ) : (
            <Image
              src={preview.url}
              width={1000}
              height={700}
              unoptimized
              alt={preview.attachment.name}
            />
          )}
          <p className="account-source">
            <a href={preview.url} target="_blank" rel="noreferrer">
              Abrir original ↗
            </a>{" "}
            · Acceso temporal privado.
          </p>
        </AccountDialog>
      )}
      {paidAds && campaignId && bundle && analysis && (
        <AccountDialog
          title={
            bundle.campaigns.find((c) => c.id === campaignId)?.name ?? "Campaña"
          }
          close={() => setCampaignId(null)}
        >
          <CampaignDetail
            bundle={bundle}
            campaignId={campaignId}
            analysis={analysis}
            manage={manage}
            edit={() => {
              const item = bundle.campaigns.find((c) => c.id === campaignId);
              setCampaignId(null);
              if (item) openForm("campaigns", recordValues(item));
            }}
          />
        </AccountDialog>
      )}
    </div>
  );
}
function Fronts({
  bundle,
  paidAds,
  manage,
  edit,
  add,
}: {
  bundle: AccountBundle;
  paidAds: boolean;
  manage: boolean;
  edit: (values: Record<string, unknown>) => void;
  add: () => void;
}) {
  return (
    <Surface
      title="Estado de frentes"
      description="Situación y siguiente acción"
      action={
        manage ? (
          <button className="account-text-button" onClick={add}>
            ＋ Frente
          </button>
        ) : undefined
      }
    >
      {bundle.fronts.some(
        (front) =>
          paidAds ||
          !/google\s*ads|\bads\b|paid|pagad/i.test(
            `${front.key} ${front.title}`,
          ),
      ) ? (
        <div className="account-fronts">
          {bundle.fronts
            .filter(
              (front) =>
                paidAds ||
                !/google\s*ads|\bads\b|paid|pagad/i.test(
                  `${front.key} ${front.title}`,
                ),
            )
            .map((front) => (
              <article key={front.id} className="account-front">
                <header>
                  <h3>{front.title}</h3>
                  <Status value={front.health} />
                </header>
                <p>{front.status}</p>
                {front.next_action && (
                  <p>
                    <strong>↗</strong>{" "}
                    {front.next_action.split(/\s+Fuente[s]?:/i)[0]}
                  </p>
                )}
                {/\s+Fuente[s]?:/i.test(front.next_action) && (
                  <details>
                    <summary>Fuente y contexto</summary>
                    <p>
                      {front.next_action
                        .split(/\s+Fuente[s]?:/i)
                        .slice(1)
                        .join(" · ")}
                    </p>
                  </details>
                )}
                <small>{shortDate(front.updated_at)}</small>
                {manage && (
                  <button onClick={() => edit(recordValues(front))}>
                    Actualizar
                  </button>
                )}
              </article>
            ))}
        </div>
      ) : (
        <Empty
          title="Frentes por confirmar"
          description={
            bundle.account.name.toLocaleLowerCase().includes("acriland")
              ? "Plataforma, agentes, taller y marketing en una sola cuenta."
              : "Web, campañas, SEO, propuesta y facturación con su estado real."
          }
        />
      )}
    </Surface>
  );
}
function Contacts({
  bundle,
  manage,
  add,
  edit,
}: {
  bundle: AccountBundle;
  manage: boolean;
  add: () => void;
  edit: (values: Record<string, unknown>) => void;
}) {
  return (
    <Surface
      title="Contactos y accesos"
      description="Personas y ubicación segura del acceso"
      action={
        manage ? (
          <button className="account-text-button" onClick={add}>
            ＋ Contacto
          </button>
        ) : undefined
      }
    >
      {bundle.contacts.length ? (
        bundle.contacts.map((contact) => (
          <div key={contact.id}>
            <div className="account-person">
              <span className="account-avatar" aria-hidden="true">
                {contact.name.charAt(0)}
              </span>
              <div>
                <strong>{contact.name}</strong>
                <span>{contact.role}</span>
                {contact.email && (
                  <a href={`mailto:${contact.email}`}>{contact.email}</a>
                )}
                {manage && (
                  <button
                    className="account-text-button"
                    onClick={() => edit(recordValues(contact))}
                  >
                    Editar
                  </button>
                )}
              </div>
            </div>
            {contact.access_location && (
              <div className="account-access-item">
                <strong>Referencia del acceso</strong>
                <span>{contact.access_location}</span>
              </div>
            )}
          </div>
        ))
      ) : (
        <Empty
          title="Contactos por registrar"
          description="Guarda responsables, correos y la referencia del gestor de accesos; nunca contraseñas."
        />
      )}
    </Surface>
  );
}
function Milestones({
  bundle,
  manage,
  add,
}: {
  bundle: AccountBundle;
  manage: boolean;
  add: () => void;
}) {
  return (
    <Surface
      title="Hitos y decisiones"
      description="Historia útil para el siguiente paso"
      action={
        manage ? (
          <button className="account-text-button" onClick={add}>
            ＋ Registro
          </button>
        ) : undefined
      }
    >
      {bundle.milestones.length ? (
        <div className="account-timeline">
          {[...bundle.milestones]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((milestone) => (
              <article className="account-timeline-item" key={milestone.id}>
                <span className="account-timeline-marker" aria-hidden="true">
                  {milestone.kind === "delivery"
                    ? "✓"
                    : milestone.kind === "decision"
                      ? "↗"
                      : "◈"}
                </span>
                <div>
                  <h3>{milestone.title}</h3>
                  <p>{milestone.description}</p>
                  <small>
                    {shortDate(milestone.date)} ·{" "}
                    {
                      {
                        milestone: "Hito",
                        decision: "Decisión",
                        delivery: "Entrega",
                      }[milestone.kind]
                    }
                  </small>
                </div>
              </article>
            ))}
        </div>
      ) : (
        <Empty
          title="Línea de tiempo sin registros"
          description="Cada decisión y entrega conservará su fecha y contexto para evitar acuerdos dispersos."
        />
      )}
    </Surface>
  );
}
function InstanceCard({
  instance,
  bundle,
  today,
  busy,
  example,
  update,
  edit,
}: {
  instance: AccountInstance;
  bundle: AccountBundle;
  today: string;
  busy: boolean;
  example: boolean;
  update: (
    instance: AccountInstance,
    status: AccountInstance["status"],
  ) => Promise<void>;
  edit: () => void;
}) {
  const writable =
      !example &&
      bundle.schema_ready &&
      !bundle.capabilities.archived &&
      (bundle.capabilities.manage ||
        (bundle.capabilities.write_own_instances &&
          instance.assignee_member_id === bundle.capabilities.member_id)),
    overdue = instance.status !== "delivered" && instance.due_date < today;
  return (
    <article className="account-task">
      <span className={overdue ? "account-overdue" : "account-source"}>
        {overdue ? "Vencido · " : ""}
        {shortDate(instance.due_date)}
      </span>
      <h3>{instance.title}</h3>
      {instance.blocked_reason && <p>{instance.blocked_reason}</p>}
      {instance.evidence && (
        <p>
          {safeUrl(instance.evidence) ? (
            <a
              href={safeUrl(instance.evidence)!}
              target="_blank"
              rel="noreferrer"
            >
              Entregable ↗
            </a>
          ) : (
            instance.evidence
          )}
        </p>
      )}
      <footer>
        <span>
          {instance.assignee_member_id === bundle.account.director_member_id
            ? bundle.account.director_name
            : instance.assignee_member_id === bundle.capabilities.member_id
              ? "Mi usuario"
              : instance.assignee_member_id
                ? (bundle.assignable_members?.find(
                    (member) => member.id === instance.assignee_member_id,
                  )?.name ?? "Especialista asignado")
                : "Por asignar"}
        </span>
        {writable && (
          <button className="account-text-button" onClick={edit}>
            Detalle
          </button>
        )}
      </footer>
      {writable && (
        <select
          aria-label={`Estado de ${instance.title}`}
          value={instance.status}
          disabled={busy}
          onChange={(e) =>
            void update(instance, e.target.value as AccountInstance["status"])
          }
        >
          {workStates.map(([key, label]) => (
            <option value={key} key={key}>
              {label}
            </option>
          ))}
        </select>
      )}
    </article>
  );
}
function Calendar({
  instances,
  today,
  month,
  onInstance,
  editable,
}: {
  instances: AccountInstance[];
  today: string;
  month: string;
  onInstance: (instance: AccountInstance) => void;
  editable: boolean;
}) {
  const start = new Date(`${month}-01T12:00:00Z`),
    offset = (start.getUTCDay() + 6) % 7,
    lastDay = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    ).getUTCDate(),
    cells = Math.ceil((offset + lastDay) / 7) * 7;
  return (
    <Surface
      title="Calendario de entregas"
      description={new Intl.DateTimeFormat("es-MX", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(start)}
    >
      <div className="account-calendar">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
          <div key={day} className="account-calendar-head">
            {day}
          </div>
        ))}
        {Array.from({ length: cells }, (_, i) => {
          const day = i - offset + 1,
            date = `${month}-${String(day).padStart(2, "0")}`,
            valid = day > 0 && day <= lastDay;
          return (
            <div
              key={i}
              className={`account-calendar-day ${date === today ? "is-today" : ""}`}
              style={!valid ? { background: "transparent" } : undefined}
            >
              {valid && (
                <>
                  <span>{day}</span>
                  {instances
                    .filter((instance) => instance.due_date === date)
                    .map((instance) => (
                      <button
                        key={instance.id}
                        className={`account-calendar-task ${instance.status !== "delivered" && date < today ? "account-overdue" : ""}`}
                        onClick={() => onInstance(instance)}
                        disabled={!editable}
                        title={instance.title}
                      >
                        {instance.title}
                      </button>
                    ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </Surface>
  );
}
function CampaignDetail({
  bundle,
  campaignId,
  analysis,
  manage,
  edit,
}: {
  bundle: AccountBundle;
  campaignId: string;
  analysis: ReturnType<typeof accountMetrics>;
  manage: boolean;
  edit: () => void;
}) {
  const {money}=useFinancialPrivacy()
  const campaign = analysis.campaignRows.find((c) => c.id === campaignId),
    changes = bundle.changes.filter((c) => c.campaign_id === campaignId);
  if (!campaign)
    return (
      <Empty
        title="Campaña fuera del periodo"
        description="Amplía el rango de fechas para ver sus resultados."
      />
    );
  return (
    <>
      <div className="account-meta">
        <Status value={campaign.status} />
        <span>{campaign.platform}</span>
        <span>
          {shortDate(campaign.period_from)}–{shortDate(campaign.period_to)}
        </span>
      </div>
      <div
        className="account-kpis"
        style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}
      >
        <Kpi label="Gasto" value={money(campaign.spend, campaign.currency)} />
        <Kpi label="Conversiones" value={number(campaign.conversions, 1)} />
        <Kpi
          label="Costo por conversión"
          value={money(campaign.costPerConversion, campaign.currency)}
        />
        <Kpi
          label="Presupuesto diario"
          value={money(campaign.daily_budget, campaign.currency)}
        />
      </div>
      {manage && (
        <button className="account-action" onClick={edit}>
          Editar campaña registrada
        </button>
      )}
      <h3 style={{ fontSize: 14, margin: "24px 0 15px" }}>
        Cambios documentados
      </h3>
      {changes.length ? (
        <div className="account-timeline">
          {changes.map((change) => (
            <article className="account-timeline-item" key={change.id}>
              <span className="account-timeline-marker">↗</span>
              <div>
                <h3>{change.action}</h3>
                <p>
                  {change.before} → {change.after}
                </p>
                <small>
                  {shortDate(change.date)} · {change.authorized_by}
                </small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="account-source">
          Sin cambios documentados para esta campaña.
        </p>
      )}
    </>
  );
}
function AttachmentThumb({
  file,
  accountId,
  example,
}: {
  file: AccountAttachment;
  accountId: string;
  example: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (example || !file.mime_type.startsWith("image/")) return;
    const request = new AbortController();
    void fetch(`/api/accounts/${accountId}/attachments/${file.id}`, {
      signal: request.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.ok) {
          const result = await response.json();
          if (!request.signal.aborted) setUrl(result.url);
        }
      })
      .catch(() => {});
    return () => request.abort();
  }, [file.id, file.mime_type, accountId, example]);
  return url ? (
    <Image src={url} alt="" width={440} height={290} unoptimized />
  ) : file.mime_type.startsWith("image/") ? (
    <span aria-hidden="true">▧</span>
  ) : null;
}
