"use client";
import {useFinancialPrivacy} from "@/components/privacy/FinancialPrivacy";
import type { AccountBundle } from "@/lib/client-accounts-types";
import type { AccountsRange } from "@/lib/client-accounts-metrics";
import { number, shortDate, Surface } from "./AccountPrimitives";

export const isMetricaAccount = (bundle: AccountBundle) =>
  bundle.account.id === "6257d252-eb54-423e-b72b-fe5deb3e078a";

function observed(bundle: AccountBundle, metric: string, range: AccountsRange) {
  return (
    bundle.snapshots.find(
      (row) =>
        !row.is_example &&
        row.source === "ga4" &&
        row.metric === metric &&
        row.grain === "period" &&
        row.date === range.from &&
        row.period_to === range.to &&
        !row.channel &&
        !row.campaign_id,
    )?.value ?? null
  );
}

export function AccountContactActions({
  bundle,
  range,
}: {
  bundle: AccountBundle;
  range: AccountsRange;
}) {
  const actions = [
    ["event_whatsapp_flotante", "WhatsApp · botón flotante"],
    ["event_whatsapp_contacto", "WhatsApp · contacto"],
    ["event_click_email", "Clic en correo"],
    ["event_click_llamada", "Clic en llamada"],
    ["event_leads_formulario", "Formulario enviado"],
  ].map(([metric, label]) => ({
    label,
    value: observed(bundle, metric, range),
  }));
  const available = actions.filter(
    (row): row is { label: string; value: number } => row.value !== null,
  );
  if (!available.length) return null;
  const total = available.reduce((sum, row) => sum + row.value, 0);
  return (
    <Surface
      title="Acciones de contacto"
      description={`${shortDate(range.from)}–${shortDate(range.to)} · GA4`}
      source="Interacciones registradas, no personas ni ventas. generate_lead no se suma de nuevo al formulario."
    >
      <div className="account-contact-total">
        <strong>{number(total)}</strong>
        <span>acciones registradas</span>
      </div>
      <div className="account-contact-breakdown">
        {available.map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            <strong>{number(row.value)}</strong>
            <div
              className="account-progress"
              role="meter"
              aria-label={row.label}
              aria-valuenow={row.value}
              aria-valuemin={0}
              aria-valuemax={Math.max(total, 1)}
            >
              <span
                style={{ width: `${total ? (row.value / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Surface>
  );
}

export function AccountMonthlyTraffic({ bundle }: { bundle: AccountBundle }) {
  const monthly = bundle.snapshots
    .filter((row) => {
      if (
        row.is_example ||
        row.source !== "ga4" ||
        row.metric !== "sessions" ||
        row.grain !== "period" ||
        row.channel ||
        row.campaign_id ||
        !row.date.endsWith("-01")
      )
        return false;
      const end = new Date(`${row.date}T12:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + 1, 0);
      return end.toISOString().slice(0, 10) === row.period_to;
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-6);
  if (!monthly.length) return null;
  const ceiling = Math.max(...monthly.map((row) => row.value), 1);
  return (
    <Surface
      title="Tráfico de los informes mensuales"
      description="Sesiones · GA4 · periodos completos"
      source="Totales originales de cada informe. No se generan días artificiales a partir de un total mensual; el informe trimestral se conserva por separado."
    >
      <div className="account-monthly-bars">
        {monthly.map((row) => (
          <div key={row.id}>
            <strong>{number(row.value)}</strong>
            <div className="account-monthly-track">
              <span
                style={{
                  height: `${Math.max(2, (row.value / ceiling) * 100)}%`,
                }}
              />
            </div>
            <span>
              {new Intl.DateTimeFormat("es-MX", {
                month: "short",
                year: "2-digit",
                timeZone: "UTC",
              }).format(new Date(`${row.date}T12:00:00Z`))}
            </span>
          </div>
        ))}
      </div>
    </Surface>
  );
}

export function AccountAcquisitionOutcome({
  bundle,
  range,
  spend,
  conversions,
}: {
  bundle: AccountBundle;
  range: AccountsRange;
  spend: number | null;
  conversions: number | null;
}) {
  const {money}=useFinancialPrivacy()
  const keyRate = observed(bundle, "key_session_rate", range);
  return (
    <Surface
      title="Captación y seguimiento comercial"
      description="Métrica BTL · responsabilidad compartida"
    >
      <div className="account-budget-figures">
        {keyRate !== null && (
          <div>
            <span>Sesiones con evento clave</span>
            <strong>{number(keyRate, 2)}%</strong>
          </div>
        )}
        {spend !== null && conversions !== null && conversions > 0 && (
          <div>
            <span>Costo por conversión Ads</span>
            <strong>{money(spend / conversions)}</strong>
          </div>
        )}
      </div>
      <p className="account-source">
        Antuario genera tráfico y contactos; el equipo comercial de Métrica
        atiende y cierra. Las conversiones de Ads y las acciones de GA4 se
        consultan por separado.
      </p>
      <a
        className="account-button is-soft"
        href="https://metricabtl.antuario.mx"
        target="_blank"
        rel="noopener noreferrer"
      >
        Revisar nueva web ↗
      </a>
      <p className="account-source">
        La migración del dominio principal requiere la autorización del cliente
        y la verificación de URLs y medición.
      </p>
    </Surface>
  );
}
