"use client";
import {useFinancialPrivacy} from "@/components/privacy/FinancialPrivacy";
import type { AccountAnalysis } from "./AccountKpiGrid";
import {
  accountColors,
  Empty,
  number,
  shortDate,
  Status,
  Surface,
} from "./AccountPrimitives";
export function BudgetCard({ analysis }: { analysis: AccountAnalysis }) {
 const {money,visible:financialVisible}=useFinancialPrivacy()

  const b = analysis.budget;
  return (
    <Surface
      title="Presupuesto y cobertura"
      description="Planeado frente a observado"
      source={b.note}
    >
      {b.spent != null || b.balance != null ? (
        <>
          <div className="account-budget-figures">
            <div>
              <span>Gasto registrado</span>
              <strong>{money(b.spent, analysis.currency)}</strong>
            </div>
            <div>
              <span>Presupuesto</span>
              <strong>{money(b.budget, analysis.currency)}</strong>
            </div>
          </div>
          {financialVisible && b.usage != null ? (
            <>
              <div
                className="account-progress"
                role="progressbar"
                aria-label="Presupuesto utilizado"
                aria-valuenow={Math.min(100, b.usage)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span
                  style={{
                    transform: `scaleX(${Math.min(1, Math.max(0, b.usage / 100))})`,
                    width: "100%",
                    background: b.alert
                      ? accountColors.peach
                      : accountColors.mint,
                  }}
                />
              </div>
              <p className="account-source">
                {number(b.usage, 1)}% del presupuesto · cierre{" "}
                {shortDate(b.periodTo)}
              </p>
            </>
          ) : (
            <p className="account-source">
              {financialVisible ? "Sin presupuesto comparable para este periodo." : "Porcentaje de presupuesto oculto."}
            </p>
          )}
          <div className="account-budget-notes">
            <div>
              <strong>{money(b.balance, analysis.currency)}</strong>
              <span>
                Saldo{" "}
                {b.balanceDate
                  ? `al ${shortDate(b.balanceDate)}`
                  : "sin fecha confirmada"}
              </span>
            </div>
            <div>
              <strong>
                {!financialVisible ? "••••" : b.daysRemaining == null
                  ? "—"
                  : `${number(b.daysRemaining, 1)} días`}
              </strong>
              <span>
                Al gasto observado de {money(b.dailyRate, analysis.currency)}
                /día
              </span>
            </div>
          </div>
          {b.alert && (
            <p className="account-budget-alert">
              El saldo proyectado no cubre los {b.plannedDays} días planeados
              restantes.
            </p>
          )}
        </>
      ) : (
        <Empty
          title="Presupuesto por confirmar"
          description="Registra presupuesto, saldo y gasto con sus fechas. La proyección aparecerá cuando haya evidencia."
        />
      )}
    </Surface>
  );
}
export function CampaignTable({
  analysis,
  onCampaign,
  historical = false,
}: {
  analysis: AccountAnalysis;
  onCampaign: (id: string) => void;
  historical?: boolean;
}) {
  const {money,visible:financialVisible}=useFinancialPrivacy()
  const budgetKnown = analysis.campaignRows.some(
    (row) => row.daily_budget != null,
  );
  const pacingKnown = analysis.campaignRows.some(
    (row) => row.period_budget != null && row.period_budget > 0,
  );
  return (
    <Surface
      title={historical ? "Campañas del informe" : "Campañas"}
      description={
        historical
          ? "Resultados históricos del periodo seleccionado"
          : "Presupuesto y resultados del periodo"
      }
      source={
        historical
          ? "El estado corresponde a la exportación original; verifica Google Ads antes de asumir que sigue vigente. No se inventan presupuestos ni saldos."
          : undefined
      }
    >
      {analysis.campaignRows.length ? (
        <div className="account-table-scroll">
          <table className="account-health-table">
            <thead>
              <tr>
                {[
                  "Campaña",
                  historical ? "Estado observado" : "Estado",
                  ...(budgetKnown ? ["Presupuesto/día"] : []),
                  "Gasto",
                  "Conversiones",
                  "Costo/conversión",
                  ...(pacingKnown ? ["Rendimiento"] : []),
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analysis.campaignRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button
                      className="account-text-button"
                      onClick={() => onCampaign(row.id)}
                    >
                      {row.name}
                    </button>
                    <small>{row.platform}</small>
                  </td>
                  <td>
                    <Status value={row.status} />
                  </td>
                  {budgetKnown && (
                    <td>{money(row.daily_budget, row.currency)}</td>
                  )}
                  <td>{money(row.spend, row.currency)}</td>
                  <td>{number(row.conversions, 1)}</td>
                  <td>{money(row.costPerConversion, row.currency)}</td>
                  {pacingKnown && (
                    <td>
                      {financialVisible && row.spend != null &&
                      row.period_budget != null &&
                      row.period_budget > 0 ? (
                        <div
                          className="account-progress is-tiny"
                          title="Gasto del presupuesto registrado"
                        >
                          <span
                            style={{
                              width: `${Math.min(100, (row.spend / row.period_budget) * 100)}%`,
                            }}
                          />
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Sin campañas en este rango"
          description="Registra una campaña con su periodo y después envía sus snapshots."
        />
      )}
    </Surface>
  );
}
