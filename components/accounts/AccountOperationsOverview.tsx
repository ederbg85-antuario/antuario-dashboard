import { useId } from "react";
import type { AccountBundle } from "@/lib/client-accounts-types";
import { acrilandOperations } from "@/lib/client-account-focus";
import { number } from "./AccountPrimitives";

export type AccountOperationsContext = {
  asOf?: string;
  negativeInventory?: { sku: string; balance: number; unit: string }[];
  pendingItems?: {
    id: string;
    title: string;
    status: string;
    priority: string;
  }[];
};
function dateLabel(value: string) {
  const withTime = value.includes("T");
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(withTime
        ? {
            hour: "2-digit" as const,
            minute: "2-digit" as const,
            hourCycle: "h23" as const,
          }
        : {}),
      timeZone: withTime ? "America/Mexico_City" : "UTC",
    })
      .formatToParts(
        new Date(value.length === 10 ? value + "T12:00:00Z" : value),
      )
      .map((part) => [part.type, part.value]),
  );
  const months = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  return `${Number(parts.day)} ${months[Number(parts.month) - 1]} ${parts.year}${withTime ? `, ${parts.hour}:${parts.minute}` : ""}`;
}

function Count({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: number | null;
  caption: string;
  tone: string;
}) {
  return (
    <div className={"acri-focus-number tone-" + tone}>
      <dt>{label}</dt>
      <dd>
        {number(value)}
        <p>{caption}</p>
      </dd>
    </div>
  );
}
function Coverage({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number | null;
  total: number | null;
  tone: string;
}) {
  const valid = value != null && total != null && total > 0 && value <= total;
  return (
    <div className={"acri-focus-coverage tone-" + tone}>
      <div>
        <span>{label}</span>
        <strong>
          {number(value)}
          <small> / {number(total)}</small>
        </strong>
      </div>
      {valid && (
        <progress value={value} max={total} aria-label={label}>
          {number(value)} de {number(total)}
        </progress>
      )}
    </div>
  );
}

/** Actual customer operations, separate from Antuario's own finance and project output. */
export function AccountOperationsOverview({
  bundle,
  compact = false,
  context,
}: {
  bundle: AccountBundle;
  compact?: boolean;
  context?: AccountOperationsContext;
}) {
  const titleId = useId(),
    chartId = useId(),
    data = acrilandOperations(bundle);
  if (!data) return null;
  const { value } = data,
    total = value("workshop_total"),
    circumference = 2 * Math.PI * 52;
  const segments = data.workshop.map((row, index) => ({
    ...row,
    start: data.workshop
      .slice(0, index)
      .reduce((sum, previous) => sum + (previous.value ?? 0), 0),
  }));
  const negatives =
    context?.negativeInventory?.filter(
      (row) => Number.isFinite(row.balance) && row.balance < 0,
    ) ?? [];
  const pending =
    context?.pendingItems?.filter((row) => row.status === "abierto") ?? [];
  return (
    <section
      className={"acri-focus" + (compact ? " is-compact" : "")}
      aria-labelledby={titleId}
    >
      <header className="acri-focus-heading">
        <div>
          <p className="acri-focus-eyebrow">Acriland · operación del cliente</p>
          <h2 id={titleId}>Taller, agentes y catálogo</h2>
        </div>
        <a
          className="acri-focus-origin"
          href="https://dashboard.acriland.com"
          target="_blank"
          rel="noreferrer"
        >
          Abrir plataforma <span aria-hidden="true">↗</span>
        </a>
      </header>
      <p className="acri-focus-cutoff">
        {data.source} · corte {dateLabel(context?.asOf ?? data.asOf)}
        {data.asOf.includes("T") && " CDMX"}
      </p>
      <dl className="acri-focus-numbers">
        <Count
          label="Pendientes del equipo"
          value={value("support_open")}
          caption="Abiertos · sin archivar"
          tone="peach"
        />
        <Count
          label="Listos para entregar"
          value={value("workshop_ready")}
          caption="Trabajos de taller"
          tone="mint"
        />
        <Count
          label="Inventario por conciliar"
          value={value("inventory_negative")}
          caption="Artículos con saldo negativo"
          tone="lilac"
        />
        <Count
          label="Catálogo publicado"
          value={value("products_published")}
          caption={
            number(value("products_total")) + " registros · incluye variantes"
          }
          tone="blue"
        />
      </dl>
      <div className="acri-focus-panels">
        <article className="acri-focus-panel">
          <header>
            <h3>Estado del taller</h3>
            <span>{number(total)} trabajos registrados</span>
          </header>
          <div className="acri-focus-workshop">
            {data.workshopComplete && total != null && total > 0 ? (
              <div className="acri-focus-donut">
                <svg viewBox="0 0 144 144" role="img" aria-labelledby={chartId}>
                  <title
                    id={chartId}
                  >{`${data.workshop.map((row) => row.label + ": " + number(row.value)).join(". ")}. Total: ${number(total)} trabajos.`}</title>
                  <circle
                    cx="72"
                    cy="72"
                    r="52"
                    className="acri-focus-track"
                    fill="none"
                    strokeWidth="18"
                  />
                  {segments.map((row) => (
                    <circle
                      key={row.key}
                      cx="72"
                      cy="72"
                      r="52"
                      fill="none"
                      stroke={row.color}
                      strokeWidth="18"
                      strokeDasharray={`${((row.value ?? 0) / total) * circumference} ${circumference}`}
                      strokeDashoffset={-(row.start / total) * circumference}
                      transform="rotate(-90 72 72)"
                    />
                  ))}
                </svg>
                <div aria-hidden="true">
                  <strong>{number(total)}</strong>
                  <span>trabajos</span>
                </div>
              </div>
            ) : (
              <p className="acri-focus-unknown">Distribución por verificar</p>
            )}
            <ul className="acri-focus-legend">
              {data.workshop.map((row) => (
                <li key={row.key}>
                  <i style={{ background: row.color }} aria-hidden="true" />
                  <span>{row.label}</span>
                  <strong>{number(row.value)}</strong>
                </li>
              ))}
            </ul>
          </div>
          <div className="acri-focus-workshop-flags">
            <span>
              <strong>{number(value("workshop_open"))}</strong> abiertos
            </span>
            <span>
              <strong>{number(value("workshop_past_due"))}</strong> con
              compromiso vencido
            </span>
            <span>
              <strong>{number(value("workshop_unassigned"))}</strong> sin
              responsable
            </span>
          </div>
          <p className="acri-focus-note">
            Etapas de la misma población de trabajos; no son pedidos ni
            entregables de Antuario.
          </p>
        </article>
        <article className="acri-focus-panel">
          <header>
            <h3>Publicación y almacén</h3>
            <a
              href="https://dashboard.acriland.com/productos"
              target="_blank"
              rel="noreferrer"
            >
              Productos ↗
            </a>
          </header>
          <Coverage
            label="Productos publicados"
            value={value("products_published")}
            total={value("products_total")}
            tone="lilac"
          />
          <Coverage
            label="Sector asignado"
            value={value("catalog_sector_assigned")}
            total={value("products_total")}
            tone="mint"
          />
          <div className="acri-focus-catalog-stats">
            <div>
              <strong>{number(value("catalog_variants"))}</strong>
              <span>Variantes existentes</span>
            </div>
            <div>
              <strong>{number(value("inventory_below_min"))}</strong>
              <span>Artículos bajo mínimo</span>
            </div>
            <div>
              <strong>{number(value("inventory_items"))}</strong>
              <span>Artículos de inventario</span>
            </div>
          </div>
          <p className="acri-focus-note">
            Publicados y sectores incluyen productos padre y variantes. Bajo
            mínimo y saldo negativo se revisan por separado.
          </p>
        </article>
      </div>
      {!compact && (
        <div className="acri-focus-panels">
          <article className="acri-focus-panel">
            <header>
              <h3>Jaime y Tocho</h3>
              <span>Registros de los últimos 7 días</span>
            </header>
            <div className="acri-focus-agent-row">
              <div
                className="acri-focus-agent-symbol tone-mint"
                aria-hidden="true"
              >
                J
              </div>
              <div>
                <h4>Jaime · WhatsApp</h4>
                <p>Acciones ejecutadas</p>
              </div>
              <strong>{number(value("jaime_actions_executed_7d"))}</strong>
            </div>
            <div className="acri-focus-agent-statuses">
              <span>
                <strong>{number(value("jaime_actions_blocked_7d"))}</strong>{" "}
                bloqueadas
              </span>
              <span>
                <strong>{number(value("jaime_actions_pending_7d"))}</strong> por
                aprobar
              </span>
            </div>
            <div className="acri-focus-agent-row">
              <div
                className="acri-focus-agent-symbol tone-lilac"
                aria-hidden="true"
              >
                T
              </div>
              <div>
                <h4>Tocho · interno</h4>
                <p>Acciones fallidas registradas</p>
              </div>
              <strong>{number(value("tocho_failed_7d"))}</strong>
            </div>
            <p className="acri-focus-note">
              Una acción no equivale a una conversación o venta. Un fallo
              histórico requiere revisar su resolución; no prueba una caída
              actual.
            </p>
            {data.actionWindow && (
              <p className="acri-focus-note">
                Ventana: {dateLabel(data.actionWindow.from)}–
                {dateLabel(data.actionWindow.to)} · corte exacto en la evidencia
                de origen.
              </p>
            )}
          </article>
          <article className="acri-focus-panel">
            <header>
              <h3>Revisión prioritaria</h3>
              <a
                href="https://dashboard.acriland.com/pendientes"
                target="_blank"
                rel="noreferrer"
              >
                Abrir pendientes ↗
              </a>
            </header>
            {pending.length > 0 && (
              <ul className="acri-focus-pending">
                {pending.map((row) => (
                  <li key={row.id}>
                    <div>
                      <strong>{row.title}</strong>
                      <span>
                        {row.priority === "alta"
                          ? "Prioridad alta"
                          : "Prioridad normal"}
                      </span>
                    </div>
                    <span className="acri-focus-open">Abierto</span>
                  </li>
                ))}
              </ul>
            )}
            {negatives.length > 0 ? (
              <div className="acri-focus-stock-list">
                <h4>Saldos registrados por conciliar</h4>
                <ul>
                  {negatives.map((row) => (
                    <li key={row.sku}>
                      <strong>{row.sku}</strong>
                      <span>
                        {number(row.balance, 2)} {row.unit}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="acri-focus-note">
                  Requiere conteo físico y un movimiento real. Las unidades no
                  se suman entre sí.
                </p>
              </div>
            ) : (
              <p className="acri-focus-note">
                Revisar {number(value("inventory_negative"))} saldos negativos
                en inventario y {number(value("support_open"))} pendientes en la
                plataforma de origen.
              </p>
            )}
            <a
              className="acri-focus-inventory-link"
              href="https://dashboard.acriland.com/inventario"
              target="_blank"
              rel="noreferrer"
            >
              Revisar inventario ↗
            </a>
          </article>
        </div>
      )}
      <details className="acri-focus-provenance">
        <summary>Fuente y alcance</summary>
        <p>
          Consulta SQL de solo lectura en Supabase de Acriland. Fotografía del
          estado registrado al corte; no representa inventario físico verificado
          ni conexión continua. Los registros de acciones abarcan siete días y
          se muestran separados de los estados actuales.
        </p>
        {data.observedDates.length > 1 && (
          <p>
            Hay cortes distintos entre métricas:{" "}
            {data.observedDates.map(dateLabel).join(" · ")}. No se combinan para
            formar una distribución sin cobertura coincidente.
          </p>
        )}
      </details>
    </section>
  );
}
