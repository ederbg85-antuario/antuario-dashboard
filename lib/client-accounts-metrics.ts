import type {
  AccountBundle,
  AccountSnapshot,
  AccountSource,
} from "./client-accounts-types";

export type AccountsRangePreset = "7d" | "30d" | "month" | "quarter" | "custom";
export type AccountsRange = {
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  preset: AccountsRangePreset;
  label: string;
};
export type AccountRange = AccountsRange;
export type AccountKpi = {
  key: string;
  label: string;
  value: number | null;
  previous: number | null;
  change: number | null;
  unit: "count" | "MXN" | "USD" | "percent" | "position";
  series: { date: string; value: number | null }[];
  source: AccountSource;
  coverageDays: number;
  totalDays: number;
  complete: boolean;
  note: string;
};
type Observation = { value: number | null; days: Set<string>; period: boolean };

const DAY = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const utc = (date: string) => new Date(`${date}T00:00:00Z`);
export const shiftAccountDate = (date: string, days: number) =>
  iso(new Date(utc(date).getTime() + days * DAY));
export function validAccountDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(utc(value).getTime()) &&
    iso(utc(value)) === value
  );
}
export function accountRangeDays(from: string, to: string) {
  if (!validAccountDate(from) || !validAccountDate(to) || from > to) return [];
  const days: string[] = [];
  for (let day = from; day <= to; day = shiftAccountDate(day, 1)) {
    days.push(day);
    if (days.length > 1096)
      throw new Error("Selecciona un periodo de hasta tres años.");
  }
  return days;
}
export function mexicoAccountDate(now: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
/** Dates are civil Mexico dates. UTC arithmetic avoids daylight-saving/host-zone drift. */
export function resolveAccountsRange(
  preset: AccountsRangePreset,
  asOf = mexicoAccountDate(),
  custom?: { from: string; to: string },
): AccountsRange {
  if (!validAccountDate(asOf)) throw new Error("Fecha de corte inválida.");
  let from: string,
    to = asOf,
    previousFrom: string,
    previousTo: string;
  const at = utc(asOf);
  if (preset === "custom") {
    if (
      !custom ||
      !validAccountDate(custom.from) ||
      !validAccountDate(custom.to) ||
      custom.from > custom.to
    )
      throw new Error("Selecciona un rango válido.");
    from = custom.from;
    to = custom.to;
  } else if (preset === "month")
    from = iso(new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)));
  else if (preset === "quarter")
    from = iso(
      new Date(
        Date.UTC(at.getUTCFullYear(), Math.floor(at.getUTCMonth() / 3) * 3, 1),
      ),
    );
  else from = shiftAccountDate(to, preset === "7d" ? -6 : -29);
  const length = accountRangeDays(from, to).length;
  if (!length) throw new Error("Selecciona un rango válido.");
  if (preset === "month") {
    previousFrom = iso(
      new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - 1, 1)),
    );
    const previousEnd = iso(
      new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 0)),
    );
    previousTo = [
      shiftAccountDate(previousFrom, length - 1),
      previousEnd,
    ].sort()[0];
  } else if (preset === "quarter") {
    const currentStart = utc(from);
    previousFrom = iso(
      new Date(
        Date.UTC(
          currentStart.getUTCFullYear(),
          currentStart.getUTCMonth() - 3,
          1,
        ),
      ),
    );
    previousTo = [
      shiftAccountDate(previousFrom, length - 1),
      shiftAccountDate(from, -1),
    ].sort()[0];
  } else {
    previousTo = shiftAccountDate(from, -1);
    previousFrom = shiftAccountDate(previousTo, -length + 1);
  }
  return {
    from,
    to,
    previousFrom,
    previousTo,
    preset,
    label:
      preset === "7d"
        ? "7 días"
        : preset === "30d"
          ? "30 días"
          : preset === "month"
            ? "Mes a la fecha"
            : preset === "quarter"
              ? "Trimestre a la fecha"
              : "Personalizado",
  };
}

/** A retry is not another observation. Corrections at the same grain replace older values. */
export function dedupeAccountSnapshots(rows: AccountSnapshot[]) {
  const bySource = new Map<string, AccountSnapshot>();
  for (const row of rows) {
    if (
      !Number.isFinite(Number(row.value)) ||
      !validAccountDate(row.date) ||
      !validAccountDate(row.period_to)
    )
      continue;
    const key = `${row.account_id}|${row.source_key}`;
    const old = bySource.get(key);
    if (
      !old ||
      row.updated_at > old.updated_at ||
      (row.updated_at === old.updated_at && row.id > old.id)
    )
      bySource.set(key, row);
  }
  const byGrain = new Map<string, AccountSnapshot>();
  for (const row of bySource.values()) {
    const key = [
      row.account_id,
      row.source,
      row.metric,
      row.unit,
      row.date,
      row.period_to,
      row.grain,
      row.channel ?? "",
      row.campaign_id ?? "",
      row.is_example,
    ].join("|");
    const old = byGrain.get(key);
    if (
      !old ||
      row.updated_at > old.updated_at ||
      (row.updated_at === old.updated_at && row.id > old.id)
    )
      byGrain.set(key, row);
  }
  return [...byGrain.values()];
}
function partition(rows: AccountSnapshot[]) {
  const total = rows.filter((row) => !row.channel && !row.campaign_id);
  if (total.length) return total;
  const campaigns = rows.filter((row) => row.campaign_id && !row.channel);
  if (campaigns.length) return campaigns;
  const channels = rows.filter((row) => row.channel && !row.campaign_id);
  return channels.length ? channels : rows;
}
function observation(
  rows: AccountSnapshot[],
  source: AccountSource,
  metric: string,
  from: string,
  to: string,
  unit?: string,
  distinct = false,
): Observation {
  const selected = rows.filter(
    (row) =>
      row.source === source &&
      row.metric === metric &&
      (!unit || row.unit === unit),
  );
  const exact = partition(
    selected.filter(
      (row) =>
        row.grain === "period" && row.date === from && row.period_to === to,
    ),
  );
  // Even disjoint channel-distinct audiences can overlap; only an account-total counts.
  const distinctExact = exact.find((row) => !row.channel && !row.campaign_id);
  if (distinct) {
    const daily =
      from === to
        ? selected.find(
            (row) =>
              row.grain === "daily" &&
              row.date === from &&
              !row.channel &&
              !row.campaign_id,
          )
        : undefined;
    return {
      value: distinctExact?.value ?? daily?.value ?? null,
      days: distinctExact
        ? new Set(accountRangeDays(from, to))
        : daily
          ? new Set([from])
          : new Set(),
      period: !!distinctExact,
    };
  }
  if (exact.length)
    return {
      value: exact.reduce((sum, row) => sum + Number(row.value), 0),
      days: new Set(accountRangeDays(from, to)),
      period: true,
    };
  const daily = selected.filter(
    (row) =>
      row.grain === "daily" &&
      row.date >= from &&
      row.date <= to &&
      row.period_to === row.date,
  );
  const days = new Set(daily.map((row) => row.date));
  let value = 0;
  for (const date of days)
    value += partition(daily.filter((row) => row.date === date)).reduce(
      (sum, row) => sum + Number(row.value),
      0,
    );
  return { value: days.size ? value : null, days, period: false };
}
const sameDays = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((day) => b.has(day));
function ratio(
  numerator: Observation,
  denominator: Observation,
  multiplier = 1,
) {
  return numerator.value !== null &&
    denominator.value !== null &&
    denominator.value > 0 &&
    sameDays(numerator.days, denominator.days)
    ? (numerator.value / denominator.value) * multiplier
    : null;
}
export function accountPercentChange(
  value: number | null,
  previous: number | null,
) {
  return value === null || previous === null || previous === 0
    ? null
    : ((value - previous) / Math.abs(previous)) * 100;
}
function weightedPosition(rows: AccountSnapshot[], from: string, to: string) {
  const impressions = rows.filter(
    (row) =>
      row.source === "search_console" &&
      row.metric === "impressions" &&
      row.unit === "count",
  );
  const positions = rows.filter(
    (row) =>
      row.source === "search_console" &&
      ["position", "average_position"].includes(row.metric) &&
      row.unit === "position",
  );
  const exact = positions.find(
    (row) =>
      row.grain === "period" &&
      row.date === from &&
      row.period_to === to &&
      !row.channel &&
      !row.campaign_id,
  );
  if (exact)
    return {
      value: exact.value,
      days: new Set(accountRangeDays(from, to)),
      period: true,
    };
  const dates = new Set(
    impressions
      .filter(
        (row) => row.grain === "daily" && row.date >= from && row.date <= to,
      )
      .map((row) => row.date),
  );
  let weight = 0,
    total = 0;
  for (const date of dates) {
    for (const row of partition(
      impressions.filter(
        (item) => item.grain === "daily" && item.date === date,
      ),
    )) {
      if (row.value <= 0) continue;
      const matching = positions.filter(
        (item) =>
          item.grain === "daily" &&
          item.date === date &&
          item.channel === row.channel &&
          item.campaign_id === row.campaign_id,
      );
      const position =
        matching.find((item) => item.metric === "position") ??
        matching.find((item) => item.metric === "average_position");
      if (!position) return { value: null, days: dates, period: false };
      weight += row.value;
      total += position.value * row.value;
    }
  }
  return {
    value: weight > 0 ? total / weight : null,
    days: dates,
    period: false,
  };
}
type KpiSpec = {
  key: string;
  label: string;
  source: AccountSource;
  metric: string;
  unit: AccountKpi["unit"];
  distinct?: boolean;
  denominator?: string;
  multiplier?: number;
  note?: string;
};
const KPI_SPECS: KpiSpec[] = [
  {
    key: "sessions",
    label: "Sesiones",
    source: "ga4",
    metric: "sessions",
    unit: "count",
  },
  {
    key: "users",
    label: "Usuarios únicos",
    source: "ga4",
    metric: "users",
    unit: "count",
    distinct: true,
    note: "Usuarios distintos del periodo exacto; los usuarios diarios no se suman.",
  },
  {
    key: "leads",
    label: "Leads",
    source: "ga4",
    metric: "leads",
    unit: "count",
    note: "Eventos de lead de GA4; no equivale a prospectos únicos ni a ventas.",
  },
  {
    key: "seoClicks",
    label: "Clics de SEO",
    source: "search_console",
    metric: "clicks",
    unit: "count",
  },
  {
    key: "seoImpressions",
    label: "Impresiones SEO",
    source: "search_console",
    metric: "impressions",
    unit: "count",
  },
  {
    key: "ctr",
    label: "CTR orgánico",
    source: "search_console",
    metric: "clicks",
    unit: "percent",
    denominator: "impressions",
    multiplier: 100,
  },
  {
    key: "position",
    label: "Posición media",
    source: "search_console",
    metric: "position",
    unit: "position",
    note: "Promedio ponderado por impresiones; una posición menor es mejor.",
  },
  {
    key: "adSpend",
    label: "Gasto en Ads",
    source: "google_ads",
    metric: "cost",
    unit: "MXN",
  },
  {
    key: "adClicks",
    label: "Clics de Ads",
    source: "google_ads",
    metric: "clicks",
    unit: "count",
  },
  {
    key: "conversions",
    label: "Conversiones Ads",
    source: "google_ads",
    metric: "conversions",
    unit: "count",
  },
  {
    key: "costPerConversion",
    label: "Costo por conversión",
    source: "google_ads",
    metric: "cost",
    unit: "MXN",
    denominator: "conversions",
  },
];
function kpiValue(
  rows: AccountSnapshot[],
  spec: KpiSpec,
  from: string,
  to: string,
  currency: string,
): Observation {
  if (spec.key === "position") return weightedPosition(rows, from, to);
  const money = spec.metric === "cost";
  const current = observation(
    rows,
    spec.source,
    spec.metric,
    from,
    to,
    money ? currency : spec.denominator ? "count" : spec.unit,
    spec.distinct,
  );
  if (!spec.denominator) return current;
  const denominator = observation(
    rows,
    spec.source,
    spec.denominator,
    from,
    to,
    "count",
  );
  return { ...current, value: ratio(current, denominator, spec.multiplier) };
}
const channelKey = (value: string | null) =>
  value === "organic" || value === "orgánico"
    ? "organic"
    : value === "paid" || value === "pagado"
      ? "paid"
      : value === "direct" || value === "directo"
        ? "direct"
        : value === "referral" || value === "referido"
          ? "referral"
          : null;
export function accountMetrics(bundle: AccountBundle, range: AccountsRange) {
  const example = bundle.data_mode === "example";
  const rows = dedupeAccountSnapshots(
    bundle.snapshots.filter((row) => row.is_example === example),
  );
  const days = accountRangeDays(range.from, range.to);
  const currency = bundle.account.currency;
  const kpis: AccountKpi[] = KPI_SPECS.map((spec) => {
    const current = kpiValue(rows, spec, range.from, range.to, currency),
      previous = kpiValue(
        rows,
        spec,
        range.previousFrom,
        range.previousTo,
        currency,
      );
    return {
      ...spec,
      ...(bundle.account.id === "6257d252-eb54-423e-b72b-fe5deb3e078a" &&
      spec.key === "leads"
        ? {
            label: "Acciones de contacto",
            note: "WhatsApp, correo, llamadas y formularios registrados en GA4. Son interacciones, no personas únicas ni ventas.",
          }
        : {}),
      unit: spec.metric === "cost" ? currency : spec.unit,
      value: current.value,
      previous: previous.value,
      change: accountPercentChange(current.value, previous.value),
      series: days.map((date) => ({
        date,
        value: kpiValue(rows, spec, date, date, currency).value,
      })),
      coverageDays: current.days.size,
      totalDays: days.length,
      complete: current.days.size === days.length && current.value !== null,
      note:
        bundle.account.id === "6257d252-eb54-423e-b72b-fe5deb3e078a" &&
        spec.key === "leads"
          ? "WhatsApp, correo, llamadas y formularios registrados en GA4. Son interacciones, no personas únicas ni ventas."
          : (spec.note ??
            (current.days.size && current.days.size < days.length
              ? `Cobertura parcial: ${current.days.size} de ${days.length} días.`
              : "")),
    };
  });
  const byKey = Object.fromEntries(kpis.map((kpi) => [kpi.key, kpi])) as Record<
    string,
    AccountKpi
  >;
  const trends = days.map((date) => ({
    date,
    sessions: observation(rows, "ga4", "sessions", date, date, "count").value,
    leads: observation(rows, "ga4", "leads", date, date, "count").value,
  }));
  const channels = days.map((date) => {
    const out: {
      date: string;
      organic: number | null;
      paid: number | null;
      direct: number | null;
      referral: number | null;
    } = { date, organic: null, paid: null, direct: null, referral: null };
    for (const row of rows.filter(
      (row) =>
        row.source === "ga4" &&
        row.metric === "leads" &&
        row.grain === "daily" &&
        row.date === date &&
        row.channel &&
        !row.campaign_id,
    )) {
      const key = channelKey(row.channel);
      if (key) out[key] = (out[key] ?? 0) + row.value;
    }
    return out;
  });
  // Funnel stages use ONE origin. Mixing Search Console and Ads impressions would double-count exposures.
  const funnel = [
    ["Impresiones", "impressions"],
    ["Clics", "clicks"],
    ["Leads", "conversions"],
    ["Cotizaciones", "quotes"],
  ].map(([name, metric]) => ({
    name,
    value: observation(
      rows,
      "google_ads",
      metric,
      range.from,
      range.to,
      "count",
    ).value,
  }));
  const campaigns = bundle.campaigns.filter(
    (campaign) =>
      campaign.is_example === example &&
      campaign.currency === currency &&
      campaign.period_from <= range.to &&
      campaign.period_to >= range.from,
  );
  const campaignSpend = campaigns
    .map((campaign) => ({
      name: campaign.name,
      id: campaign.id,
      value: observation(
        rows.filter((row) => row.campaign_id === campaign.id),
        "google_ads",
        "cost",
        range.from,
        range.to,
        currency,
      ).value,
    }))
    .filter(
      (item): item is typeof item & { value: number } => item.value !== null,
    );
  const campaignRows = campaigns.map((campaign) => {
    const scoped = rows.filter((row) => row.campaign_id === campaign.id);
    const cost = observation(
        scoped,
        "google_ads",
        "cost",
        range.from,
        range.to,
        currency,
      ),
      conversions = observation(
        scoped,
        "google_ads",
        "conversions",
        range.from,
        range.to,
        "count",
      );
    return {
      ...campaign,
      spend: cost.value,
      conversions: conversions.value,
      costPerConversion: ratio(cost, conversions),
      clicks: observation(
        scoped,
        "google_ads",
        "clicks",
        range.from,
        range.to,
        "count",
      ).value,
    };
  });
  const scopedBudgets = campaigns.filter(
    (campaign) =>
      campaign.period_from === range.from && campaign.period_to >= range.to,
  );
  const budget =
    scopedBudgets.length &&
    scopedBudgets.every((campaign) => campaign.period_budget !== null)
      ? scopedBudgets.reduce(
          (sum, campaign) => sum + Number(campaign.period_budget),
          0,
        )
      : null;
  const latestBalance = rows
    .filter(
      (row) =>
        row.source === "google_ads" &&
        row.metric === "balance" &&
        row.unit === currency &&
        !row.channel &&
        !row.campaign_id &&
        row.date <= range.to &&
        row.period_to <= range.to,
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.updated_at.localeCompare(a.updated_at),
    )[0];
  const balance = latestBalance?.value ?? null;
  const spend = byKey.adSpend.value,
    spendDays = byKey.adSpend.coverageDays;
  const dailyRate = spend !== null && spendDays > 0 ? spend / spendDays : null;
  const daysRemaining =
    balance !== null && balance >= 0 && dailyRate !== null && dailyRate > 0
      ? balance / dailyRate
      : null;
  const forecastEnd = campaigns.length
    ? (campaigns
        .map((campaign) => campaign.period_to)
        .sort()
        .at(-1) ?? range.to)
    : range.to;
  const plannedDays = Math.max(
    0,
    accountRangeDays(range.to, forecastEnd).length - 1,
  );
  const budgetView = {
    spent: spend,
    budget,
    balance,
    balanceDate: latestBalance?.date ?? null,
    periodTo: forecastEnd,
    dailyRate,
    daysRemaining,
    plannedDays,
    alert:
      daysRemaining !== null && plannedDays > 0 && daysRemaining < plannedDays,
    usage:
      budget !== null && budget > 0 && spend !== null
        ? (spend / budget) * 100
        : null,
    note: "Presupuesto del periodo de campaña. Proyección: saldo dividido entre el gasto medio de los días observados. No incluye cambios futuros de puja, presupuesto ni tipo de cambio.",
  };
  kpis.push({
    key: "adBalance",
    label: "Saldo de Ads",
    value: balance,
    previous: null,
    change: null,
    unit: currency,
    series: days.map((date) => ({
      date,
      value: observation(rows, "google_ads", "balance", date, date, currency)
        .value,
    })),
    source: "google_ads",
    coverageDays: latestBalance ? 1 : 0,
    totalDays: 1,
    complete: !!latestBalance,
    note: latestBalance
      ? `Último saldo observado: ${latestBalance.date}.`
      : "Saldo no registrado.",
  });
  const invoices = bundle.invoices.filter(
    (invoice) =>
      invoice.is_example === example &&
      invoice.currency === currency &&
      invoice.status === "issued",
  );
  // A cancelled invoice does not reverse an actual cash receipt. Keep cash and receivable reconciliation distinct.
  const payments = [
    ...new Map(
      bundle.payments
        .filter(
          (payment) =>
            payment.is_example === example && payment.currency === currency,
        )
        .map((payment) => [payment.source_key, payment]),
    ).values(),
  ];
  const months = [...new Set([...days.map((date) => date.slice(0, 7))])];
  const billing = months.map((month) => {
    const issued = invoices.filter(
      (invoice) =>
        invoice.issued_date.startsWith(month) &&
        invoice.issued_date >= range.from &&
        invoice.issued_date <= range.to,
    );
    const collected = payments.filter(
      (payment) =>
        payment.date.startsWith(month) &&
        payment.date >= range.from &&
        payment.date <= range.to,
    );
    return {
      month,
      invoiced: issued.length
        ? issued.reduce((sum, invoice) => sum + invoice.total, 0)
        : null,
      collected: collected.length
        ? collected.reduce((sum, payment) => sum + payment.amount, 0)
        : null,
    };
  });
  const dueInvoices = invoices
    .filter((invoice) => invoice.issued_date <= range.to)
    .map((invoice) => {
      const linkedPayments = payments.filter(
        (payment) =>
          payment.invoice_id === invoice.id && payment.date <= range.to,
      );
      const paid = linkedPayments.length
        ? linkedPayments.reduce((sum, payment) => sum + payment.amount, 0)
        : null;
      const outstanding =
        paid === null ? null : Math.max(0, invoice.total - paid);
      const daysLate =
        outstanding === null
          ? null
          : outstanding > 0 && invoice.due_date && invoice.due_date < range.to
            ? accountRangeDays(invoice.due_date, range.to).length - 1
            : 0;
      return { ...invoice, paid, outstanding, daysLate };
    });
  const inRangeInvoices = invoices.filter(
    (invoice) =>
      invoice.issued_date >= range.from && invoice.issued_date <= range.to,
  );
  const validInvoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const inRangePayments = payments.filter(
    (payment) => payment.date >= range.from && payment.date <= range.to,
  );
  const paymentsAsOf = payments.filter((payment) => payment.date <= range.to);
  const billingSummary = {
    invoiced: inRangeInvoices.length
      ? inRangeInvoices.reduce((sum, invoice) => sum + invoice.total, 0)
      : null,
    collected: inRangePayments.length
      ? inRangePayments.reduce((sum, payment) => sum + payment.amount, 0)
      : null,
    outstanding:
      dueInvoices.length &&
      dueInvoices.every((invoice) => invoice.outstanding !== null)
        ? dueInvoices.reduce(
            (sum, invoice) => sum + (invoice.outstanding ?? 0),
            0,
          )
        : null,
    pendingReceipts: paymentsAsOf.length
      ? paymentsAsOf.filter((payment) => payment.receipt_status === "pending")
          .length
      : null,
    daysLate:
      dueInvoices.length &&
      dueInvoices.every((invoice) => invoice.daysLate !== null)
        ? dueInvoices.reduce(
            (max, invoice) => Math.max(max, invoice.daysLate ?? 0),
            0,
          )
        : null,
    unappliedPayments: paymentsAsOf.length
      ? paymentsAsOf
          .filter(
            (payment) =>
              !payment.invoice_id || !validInvoiceIds.has(payment.invoice_id),
          )
          .reduce((sum, payment) => sum + payment.amount, 0)
      : null,
    foreignCurrencyExcluded:
      bundle.invoices.some((invoice) => invoice.currency !== currency) ||
      bundle.payments.some((payment) => payment.currency !== currency),
    hasInvoices: invoices.length > 0,
    hasPayments: payments.length > 0,
  };
  const overdue = bundle.instances.filter(
    (instance) =>
      instance.is_example === example &&
      instance.status !== "delivered" &&
      instance.due_date < range.to,
  ).length;
  return {
    kpis,
    byKey,
    trends,
    channels,
    funnel,
    campaignSpend,
    campaignRows,
    budget: budgetView,
    billing,
    billingSummary,
    invoices: dueInvoices,
    overdue,
    currency,
    range,
    observedDays: days.length,
    hasMetrics: rows.some(
      (row) => row.date <= range.to && row.period_to >= range.from,
    ),
    isExample: example,
    sourceNotes: [
      "GA4: sesiones y eventos de lead; Search Console: búsqueda orgánica; Google Ads: anuncios. Las fuentes no se suman entre sí.",
      "Las oportunidades comerciales se muestran por separado y no se incluyen en facturación ni cobros.",
    ],
  };
}
